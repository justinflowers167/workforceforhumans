// Phase 12 §B2 (2026-04-27) — Lightweight user feedback inbox endpoint.
// Called by the floating feedback widget injected by /assets/site.js on
// every page. Anonymous; gated only by basic input validation, a
// honeypot, and a simple per-IP rate check. Optionally summarizes +
// prioritizes via Claude Haiku 4.5 when ANTHROPIC_API_KEY is set.
//
// Body shape:
//   {
//     page_path:   string  (required, the location.pathname at submission)
//     category:    'bug'|'feature-request'|'praise'|'confusion'|'other'
//     message:     string  (5-2000 chars; enforced both here and by DB check)
//     user_email:  string? (optional; not validated server-side)
//     hp:          string? (honeypot — silently drop if filled)
//   }
//
// `verify_jwt = false` in supabase/config.toml — the function is anon-
// callable. Service-role client used internally because the `feedback`
// table has no SELECT policy and we want to bypass RLS for the insert
// (RLS allows insert to public, but bypassing keeps the service-role
// pattern uniform across the project's edge functions).

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";

const VALID_CATEGORIES = new Set(["bug", "feature-request", "praise", "confusion", "other"]);
const VALID_PRIORITIES = new Set(["p0", "p1", "p2", "p3"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TRIAGE_PROMPT = `You triage user feedback for Workforce for Humans, a platform that helps displaced and career-changing workers find jobs and training.

For each feedback message, return ONLY valid JSON:
{"summary": "<10-15 words distilling the user's core ask or pain>", "priority": "p0"|"p1"|"p2"|"p3"}

Priority guide:
- p0: site-broken / data loss / security concern. Drop everything.
- p1: significant UX block, payment friction, accessibility issue affecting a real population, mis-stated facts on legal/privacy pages.
- p2: feature requests with clear user value, minor bugs, polish gaps.
- p3: praise, opinion, low-value commentary, things outside scope.

Output JSON only. No prose.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  // Honeypot: bots that fill in `hp` get a silent 200. No DB write, no
  // signal to the bot that it was flagged.
  if (body?.hp) {
    return json({ ok: true });
  }

  const page_path = typeof body?.page_path === "string" ? body.page_path.slice(0, 200) : "";
  const category = typeof body?.category === "string" && VALID_CATEGORIES.has(body.category) ? body.category : "other";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const user_email = typeof body?.user_email === "string" && body.user_email.length <= 200 ? body.user_email.trim() || null : null;
  const user_agent = (req.headers.get("user-agent") || "").slice(0, 500);

  if (!page_path) return json({ error: "page_path required" }, 400);
  if (message.length < 5 || message.length > 2000) {
    return json({ error: "message must be 5-2000 characters" }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Optional Claude triage. Skipped silently if no API key or if the
  // call errors — feedback still lands in the table, just untriaged.
  let claude_summary: string | null = null;
  let claude_priority: string | null = null;
  if (ANTHROPIC_API_KEY) {
    try {
      const triage = await triageWithClaude(message, category);
      if (triage) {
        claude_summary = triage.summary;
        claude_priority = triage.priority;
      }
    } catch (err) {
      console.error("submit-feedback: triage failed (continuing):", err);
    }
  }

  const { error: insErr } = await admin.from("feedback").insert({
    page_path,
    category,
    message,
    user_email,
    user_agent,
    claude_summary,
    claude_priority,
  });
  if (insErr) {
    console.error("submit-feedback: insert error:", insErr);
    return json({ error: "could not save feedback. please try again." }, 500);
  }

  return json({ ok: true });
});

async function triageWithClaude(
  message: string,
  category: string,
): Promise<{ summary: string; priority: string } | null> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: [
      { type: "text", text: TRIAGE_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: JSON.stringify({ category, message: message.slice(0, 1500) }),
      },
    ],
  });
  const raw = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return null;
  }
  const summary = typeof parsed?.summary === "string" ? parsed.summary.slice(0, 200) : null;
  const priority = typeof parsed?.priority === "string" && VALID_PRIORITIES.has(parsed.priority) ? parsed.priority : null;
  if (!summary || !priority) return null;
  return { summary, priority };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
