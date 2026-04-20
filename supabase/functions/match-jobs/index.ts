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

const SYSTEM_PROMPT = `You are a job-matching analyst for Workforce for Humans — a platform that helps people displaced by AI, layoffs, and automation find real work and real training. You and the member make the dreamwork a reality: they drive, you support with honest reads on fit and growth.

Score each job (0-100) for this candidate based on fit: skills overlap, desired roles, pay expectations, location/remote, seniority, and realistic growth path (career-changers get credit for transferable skills). Return ONLY valid JSON:

{"matches":[{"job_id":string,"score":integer,"rationale":string,"reasons":string[],"growth_note":string}]}

Match this voice: direct, empathetic without saccharine, action verbs over adjectives, validates struggle without dwelling. Examples of the Workforce for Humans voice:
- "Whether you've been laid off, need a career change, or are starting from zero — we connect real people with employers who are actively hiring. No degree gatekeeping. No runaround."
- "Free guides and resources to help you find work, build skills, and navigate your career — no matter where you're starting from."
- "Pick one agentic framework, build something small, and document it. That portfolio is your leverage."

Field specs:
- score: integer 0-100.
- rationale: 2-3 sentences. Name what about THIS candidate's profile fits THIS job. Second person ("you"). Concrete, not generic. No hedging ("might", "could possibly").
- growth_note: 1-2 sentences. The NEXT EDGE — what the candidate would sharpen into this role. Start with verbs: "Sharpening...", "Adding...", "Naming...", "A small portfolio piece in...". Never "you lack", "missing", "weakness". If the fit is already tight, name the stretch inside the role itself, not a gap in the profile.
- reasons: 2-4 short tags like "skills overlap", "remote ok", "pay match".

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

    const { data: haveRows } = await admin
      .from("job_seeker_skills")
      .select("skills(name)")
      .eq("job_seeker_id", seeker.id);
    const skillsHave = (haveRows || []).map((r: any) => r.skills?.name).filter(Boolean);

    const { data: jobs } = await admin
      .from("jobs")
      .select("id, title, description, requirements, nice_to_have, location_city, location_state, is_remote, employment_type, experience_level, pay_type, pay_min, pay_max")
      .eq("status", "active")
      .order("posted_at", { ascending: false })
      .limit(MAX_JOBS_TO_SCORE);
    if (!jobs?.length) return json({ ok: true, matches: [] });

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
      pay: { type: j.pay_type, min: j.pay_min, max: j.pay_max },
    }));

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify({ candidate: profilePayload, jobs: jobsPayload }) }],
    });
    const raw = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("no JSON in model output");
    const parsed = JSON.parse(raw.slice(s, e + 1));
    const matches: Array<{ job_id: string; score: number; rationale: string; reasons: string[]; growth_note?: string }> = parsed.matches || [];
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
