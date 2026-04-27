// Score recent active jobs against a member's profile using Claude. Upserts match_scores rows.

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-sonnet-4-6";
const MAX_JOBS_TO_SCORE = 50;
const TOP_N = 10;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a career coach and job-matching analyst for Workforce for Humans — a platform that helps people displaced by AI, layoffs, and automation find real work and real training. You and the member make the dreamwork a reality: they drive, you support with honest reads on fit and growth, plus a per-match coach brief they can act on today.

Score each job (0-100) for this candidate based on fit: skills overlap, desired roles, pay expectations, location/remote, seniority, and realistic growth path (career-changers get credit for transferable skills). For each kept match, ALSO produce a coach brief — the resume tailoring, skill-gap path, and application strategy this seeker would use to actually land THIS role.

Return ONLY valid JSON:

{"matches":[{"job_id":string,"score":integer,"rationale":string,"reasons":string[],"growth_note":string,"resume_tailoring":string,"skill_gap_plan":string,"application_strategy":string}]}

Match this voice: direct, empathetic without saccharine, action verbs over adjectives, validates struggle without dwelling. Practitioner-coach, not motivational poster. Examples of the Workforce for Humans voice:
- "Whether you've been laid off, need a career change, or are starting from zero — we connect real people with employers who are actively hiring. No degree gatekeeping. No runaround."
- "Free guides and resources to help you find work, build skills, and navigate your career — no matter where you're starting from."
- "Pick one agentic framework, build something small, and document it. That portfolio is your leverage."

Field specs:
- score: integer 0-100.
- rationale: 2-3 sentences. Name what about THIS candidate's profile fits THIS job. Second person ("you"). Concrete, not generic. No hedging ("might", "could possibly").
- reasons: 2-4 short tags like "skills overlap", "remote ok", "pay match".
- growth_note: 1-2 sentences. The NEXT EDGE — what the candidate would sharpen into this role. Start with verbs: "Sharpening...", "Adding...", "Naming...", "A small portfolio piece in...". Never "you lack", "missing", "weakness". If the fit is already tight, name the stretch inside the role itself, not a gap in the profile. WHEN the job specifies ai_skills_required and the candidate's skills_have lacks one or more, the growth_note MUST name the single most-leveraged AI skill to learn first (highest reuse across the role's daily work). Don't list multiple — pick one and be specific. The platform shows curated free training for that exact skill below the match card.
- resume_tailoring: 2-3 sentences. CONCRETE edits to the resume bullets the seeker already has, not generic advice. Reference real lines from resume_raw_text or resume_parsed when possible (e.g. "Lead your summary with the Acme migration outcome — that's the systems-integration signal this role's screening for"). If the resume is thin or absent, say what to ADD to the top of the resume that this role would screen for. Never "make your resume better"; always "do X with bullet Y because role wants Z".
- skill_gap_plan: 2-4 sentences as a short ordered path. Format: name 1-2 things the seeker already brings (from skills_have or resume_parsed), then the 1-2 things the role wants that they don't yet have, then the FIRST step to close it (a free course, a portfolio piece, a side project — be specific). Same coach voice as growth_note: never "you lack" / "missing"; frame as "the next edge" / "to grow into this you'd add". When ai_skills_required has items and skills_have is missing them, the FIRST step MUST be the same single AI skill named in growth_note (consistency: training panel shows one skill).
- application_strategy: 2-3 sentences. The angle to lead with — cover letter opener, what to over-index on in the application, what NOT to over-emphasize. For federal roles (source = usajobs), include the "mirror the JD keywords into the resume + questionnaire" advice — federal HR systems screen on exact phrase matches. For private-sector roles, focus on the warm-intro / hiring-manager-LinkedIn angle when relevant. Always actionable today.

Only include jobs scoring 40 or higher. Sort descending by score. Cap at 10. Return ONLY the JSON object — no prose before or after.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "missing auth" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthenticated" }, 401);
    const authUserId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: seeker } = await admin
      .from("job_seekers")
      .select("id, headline, summary, career_stage, desired_pay_min, desired_pay_type, open_to_remote, location_city, location_state, desired_roles, desired_skills")
      .eq("auth_user_id", authUserId)
      .single();
    if (!seeker) return json({ error: "no profile" }, 404);

    // Phase 13 (2026-04-28): pull the seeker's current resume so the
    // career-copilot fields can reference real bullets, not generic advice.
    // raw_text gives the literal resume text the model can quote back at
    // the seeker; parsed_json gives the structured shape (experience,
    // skills, education) for cross-reference. Both are nullable: an
    // un-parsed resume just degrades the brief to less-specific advice.
    const { data: haveRows } = await admin
      .from("job_seeker_skills")
      .select("skills(name)")
      .eq("job_seeker_id", seeker.id);
    const skillsHave = (haveRows || []).map((r: any) => r.skills?.name).filter(Boolean);

    const { data: resumeRow } = await admin
      .from("resumes")
      .select("raw_text, parsed_json")
      .eq("job_seeker_id", seeker.id)
      .eq("is_current", true)
      .maybeSingle();

    const { data: jobs } = await admin
      .from("jobs")
      .select("id, title, description, requirements, nice_to_have, location_city, location_state, is_remote, employment_type, experience_level, pay_type, pay_min, pay_max")
      .eq("status", "active")
      .order("posted_at", { ascending: false })
      .limit(MAX_JOBS_TO_SCORE);
    if (!jobs?.length) return json({ ok: true, matches: [] });

    // Phase 12 §C3: pull AI-skill labels per job so the prompt can reason
    // about training needs. Single grouped query keyed by job_id avoids
    // N+1 round-trips at the cost of a small in-memory grouping pass.
    const jobIds = jobs.map((j: any) => j.id);
    const { data: jobAiSkillRows } = await admin
      .from("job_skills")
      .select("job_id, skills!inner(name, is_ai_skill)")
      .in("job_id", jobIds)
      .eq("skills.is_ai_skill", true);
    const aiSkillsByJob = new Map<string, string[]>();
    for (const row of jobAiSkillRows || []) {
      // @ts-ignore joined-row shape
      const name = row.skills?.name;
      if (!name) continue;
      const arr = aiSkillsByJob.get(row.job_id) || [];
      arr.push(name);
      aiSkillsByJob.set(row.job_id, arr);
    }

    const profilePayload = {
      headline: seeker.headline,
      summary: seeker.summary,
      career_stage: seeker.career_stage,
      desired_roles: seeker.desired_roles || [],
      desired_skills: seeker.desired_skills || [],
      skills_have: skillsHave,
      desired_pay_min: seeker.desired_pay_min,
      desired_pay_type: seeker.desired_pay_type,
      open_to_remote: seeker.open_to_remote,
      location: [seeker.location_city, seeker.location_state].filter(Boolean).join(", "),
      // Phase 13 (2026-04-28): resume context for the career-copilot fields.
      // raw_text capped at 4000 chars (~1000 tokens) to bound input cost;
      // parsed_json passed as-is (typically 500-800 tokens). Both null when
      // the seeker hasn't uploaded/parsed a resume yet — coach brief still
      // produced but less-specific without bullets to quote back.
      resume_raw_text: typeof resumeRow?.raw_text === "string" ? resumeRow.raw_text.slice(0, 4000) : null,
      resume_parsed: resumeRow?.parsed_json ?? null,
    };
    const jobsPayload = jobs.map((j: any) => ({
      job_id: j.id,
      title: j.title,
      description: (j.description || "").slice(0, 800),
      requirements: j.requirements,
      nice_to_have: j.nice_to_have,
      location: [j.location_city, j.location_state].filter(Boolean).join(", "),
      is_remote: j.is_remote,
      employment_type: j.employment_type,
      experience_level: j.experience_level,
      ai_skills_required: aiSkillsByJob.get(j.id) || [],
      pay: { type: j.pay_type, min: j.pay_min, max: j.pay_max },
    }));

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    // Prompt-cache the system block. Phase 13 (2026-04-28) extended the
    // system prompt with three new field specs (resume_tailoring,
    // skill_gap_plan, application_strategy); the prompt is now well past
    // Anthropic's 1024-token minimum cacheable prefix so this marker is
    // no longer a no-op — the second invocation in any 5-minute window
    // reads from cache at 10% of standard input rate.
    const resp = await client.messages.create({
      model: MODEL,
      // 8000 (Phase 13) up from 6000 — three new prose fields × 10 matches
      // adds roughly 2400 output tokens; headroom for longer rationales
      // when the resume context produces richer briefs.
      max_tokens: 8000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: JSON.stringify({ candidate: profilePayload, jobs: jobsPayload }) }],
    });
    const raw = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("no JSON in model output");
    const parsed = JSON.parse(raw.slice(s, e + 1));
    const matches: Array<{
      job_id: string;
      score: number;
      rationale: string;
      reasons: string[];
      growth_note?: string;
      resume_tailoring?: string;
      skill_gap_plan?: string;
      application_strategy?: string;
    }> = parsed.matches || [];
    const top = matches.slice(0, TOP_N);

    await admin
      .from("match_scores")
      .delete()
      .eq("job_seeker_id", seeker.id)
      .eq("match_type", "job")
      .is("emailed_at", null);

    if (top.length) {
      const rows = top.map((m) => ({
        job_seeker_id: seeker.id,
        match_type: "job",
        match_target_id: m.job_id,
        similarity: Math.max(0, Math.min(1, (m.score || 0) / 100)),
        score: m.score,
        rationale: m.rationale,
        match_reasons: m.reasons || [],
        growth_note: m.growth_note ?? null,
        // Phase 13 (2026-04-28): per-match coach brief. All nullable so
        // pre-Phase-13 rows render cleanly under the same disclosure;
        // member.html hides any sub-section whose field is null.
        resume_tailoring: m.resume_tailoring ?? null,
        skill_gap_plan: m.skill_gap_plan ?? null,
        application_strategy: m.application_strategy ?? null,
      }));
      await admin.from("match_scores").insert(rows);
    }

    return json({ ok: true, matches: top });
  } catch (err) {
    console.error("match-jobs error:", err);
    return json({ error: "Matching failed. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
