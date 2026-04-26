// Parse a resume row with Claude: extract structured profile + generate review feedback.
// Invoked by authenticated member from the browser with { resume_id }.

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

// PDF-parsing strategy (revised 2026-04-25): we send PDFs directly to
// Claude as a document content block instead of extracting text first
// with pdf-parse. Two reasons: (a) pdf-parse@1.1.1 was repeatedly
// crashing on Deno cold-starts at esm.sh — first the static import
// killed the entire function (OPTIONS-500 → "Failed to fetch"), then
// the lazy-loaded import threw at runtime. (b) Claude's native PDF
// understanding is structurally better than text-stripping — it sees
// columns, tables, headers, dates as a coherent document.
//
// DOCX still goes through mammoth (lazy-loaded — no Deno-native PDF-
// equivalent for Word). If mammoth ever breaks at esm.sh the way
// pdf-parse did, the DOCX path will return a clean 500 instead of
// taking down the function.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a resume analyst for Workforce for Humans, a platform that helps displaced and career-changing workers find AI-era-relevant jobs.

Given a resume, return ONLY valid JSON matching this shape:

{
  "parsed": {
    "full_name": string | null,
    "headline": string | null,
    "summary": string,
    "location_city": string | null,
    "location_state": string | null,
    "email": string | null,
    "phone": string | null,
    "experience": [{"title": string, "company": string, "start": string, "end": string | null, "highlights": string[]}],
    "education": [{"credential": string, "institution": string, "year": string | null}],
    "skills_have": string[],
    "skills_want": string[],
    "desired_roles": string[],
    "career_stage": "entry-level" | "early-career" | "mid-career" | "senior" | "career-changer" | "returning-to-work" | "late-career" | "pre-retirement"
  },
  "review": {
    "strengths": string[],
    "gaps": string[],
    "rewrites": [{"original": string, "improved": string, "why": string}],
    "market_notes": string,
    "ats_tips": string[]
  }
}

Rules:
- skills_have: concrete skills visible in the resume (tools, certifications, domain expertise). Normalize to lowercase singular noun phrases.
- skills_want: skills the person should add to be competitive for their desired roles — especially AI-era skills where relevant.
- desired_roles: 3-6 realistic next-step roles given their history and the current job market.
- rewrites: pick 3 bullet points that could be punchier or more outcome-oriented.
- market_notes: 2-3 sentences on demand, pay bands, and AI-era positioning.
- Be specific and honest. No fluff.
- Output valid JSON only. No prose, no code fences.`;

// Returns either a plain-text string (paste/builder/docx/txt) OR a Claude
// content-block array containing a `document` block (for PDF), so the
// caller can pass either shape directly into messages.create().
async function getResumeUserMessage(
  resume: any,
  admin: ReturnType<typeof createClient>,
): Promise<string | any[]> {
  if (resume.raw_text && String(resume.raw_text).trim().length >= 40) {
    return `Resume:\n\n${String(resume.raw_text).slice(0, 20000)}`;
  }
  if (!resume.file_path) {
    throw new Error("resume has no raw_text and no file_path");
  }

  const { data, error } = await admin.storage.from("resumes").download(resume.file_path);
  if (error || !data) throw new Error(`storage download failed: ${error?.message}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  const lower = String(resume.file_path).toLowerCase();

  if (lower.endsWith(".pdf")) {
    // Send the PDF directly to Claude as a document content block.
    // Sonnet 4.6 reads PDFs natively and we avoid pdf-parse's known
    // Deno cold-start crashes.
    const base64 = encodeBase64(buf);
    return [
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
      },
      {
        type: "text",
        text: "Parse this resume and return the JSON described in the system prompt. JSON only — no prose, no code fences.",
      },
    ];
  }

  if (lower.endsWith(".docx")) {
    const mod: any = await import("https://esm.sh/mammoth@1.8.0?target=deno");
    const mammoth = mod.default || mod;
    const result = await mammoth.extractRawText({ buffer: buf });
    const text = result.value || "";
    if (text.trim().length < 40) throw new Error("resume text too short");
    // Persist extracted text so re-parses don't have to re-extract.
    await admin.from("resumes").update({ raw_text: text }).eq("id", resume.id);
    return `Resume:\n\n${text.slice(0, 20000)}`;
  }

  // Plain text fallback (rare — uploads are normally pdf/docx).
  const text = new TextDecoder().decode(buf);
  if (text.trim().length < 40) throw new Error("resume text too short");
  await admin.from("resumes").update({ raw_text: text }).eq("id", resume.id);
  return `Resume:\n\n${text.slice(0, 20000)}`;
}

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

    const { resume_id } = await req.json();
    if (!resume_id) return json({ error: "missing resume_id" }, 400);

    const { data: resume, error: rErr } = await admin
      .from("resumes")
      .select("id, job_seeker_id, source, raw_text, file_path, job_seekers!inner(auth_user_id)")
      .eq("id", resume_id)
      .single();
    if (rErr || !resume) return json({ error: "resume not found" }, 404);
    // @ts-ignore joined shape
    if (resume.job_seekers.auth_user_id !== authUserId) return json({ error: "forbidden" }, 403);

    let userContent: string | any[];
    try {
      userContent = await getResumeUserMessage(resume, admin);
    } catch (err: any) {
      const msg = String(err?.message || err).slice(0, 500);
      await admin.from("resumes").update({ status: "failed", error_message: msg }).eq("id", resume.id);
      return json({ error: msg.includes("too short") ? "Resume text is empty or too short." : "Could not read the resume file. Try re-uploading or pasting the text." }, 400);
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    // Prompt-cache the system block. No-op today: SYSTEM_PROMPT is below
    // Anthropic's 1024-token minimum cacheable prefix, so the marker is
    // ignored silently. Forward-compatible.
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [{ role: "user", content: userContent as any }],
    });

    const raw = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd < 0) throw new Error("no JSON in model output");
    const parsedModel = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const parsed = parsedModel.parsed || {};
    const review = parsedModel.review || {};

    await admin
      .from("resumes")
      .update({
        parsed_json: parsed,
        review_json: review,
        status: "parsed",
        error_message: null,
        is_current: true,
      })
      .eq("id", resume.id);

    await admin
      .from("resumes")
      .update({ is_current: false })
      .eq("job_seeker_id", resume.job_seeker_id)
      .neq("id", resume.id);

    const seekerPatch: Record<string, unknown> = {};
    if (parsed.full_name) {
      const [first, ...rest] = parsed.full_name.split(/\s+/);
      seekerPatch.first_name = first;
      if (rest.length) seekerPatch.last_name = rest.join(" ");
    }
    if (parsed.headline) seekerPatch.headline = parsed.headline;
    if (parsed.summary) seekerPatch.summary = parsed.summary;
    if (parsed.location_city) seekerPatch.location_city = parsed.location_city;
    if (parsed.location_state) seekerPatch.location_state = parsed.location_state;
    if (parsed.phone) seekerPatch.phone = parsed.phone;
    if (parsed.career_stage) seekerPatch.career_stage = parsed.career_stage;
    if (Array.isArray(parsed.desired_roles)) seekerPatch.desired_roles = parsed.desired_roles;
    if (Array.isArray(parsed.skills_want)) seekerPatch.desired_skills = parsed.skills_want;
    if (Object.keys(seekerPatch).length) {
      await admin.from("job_seekers").update(seekerPatch).eq("id", resume.job_seeker_id);
    }

    const have: string[] = Array.isArray(parsed.skills_have) ? parsed.skills_have : [];
    if (have.length) {
      const { data: existing } = await admin.from("skills").select("id,name").in("name", have);
      const existingByName = new Map((existing || []).map((r: any) => [r.name.toLowerCase(), r.id]));
      const toInsert = have
        .filter((n) => !existingByName.has(n.toLowerCase()))
        .map((n) => ({ name: n, slug: n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }));
      if (toInsert.length) {
        const { data: inserted } = await admin.from("skills").insert(toInsert).select("id,name");
        for (const r of inserted || []) existingByName.set(r.name.toLowerCase(), r.id);
      }
      await admin.from("job_seeker_skills").delete().eq("job_seeker_id", resume.job_seeker_id);
      const rows = have
        .map((n) => existingByName.get(n.toLowerCase()))
        .filter((id): id is number => typeof id === "number")
        .map((skill_id) => ({ job_seeker_id: resume.job_seeker_id, skill_id }));
      if (rows.length) await admin.from("job_seeker_skills").insert(rows);
    }

    return json({ ok: true, parsed, review });
  } catch (err) {
    console.error("parse-resume error:", err);
    return json({ error: "Resume could not be parsed. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
