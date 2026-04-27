// Phase 12 §B2 (2026-04-27) — Lightweight user feedback inbox endpoint.
// Called by the floating feedback widget injected by /assets/site.js on
// every page. Anonymous; gated only by basic input validation, a
// honeypot, and a per-IP rate limit (5 submissions per 60s per IP,
// hashed). Optionally summarizes + prioritizes via Claude Haiku 4.5
// when ANTHROPIC_API_KEY is set.
//
// The rate limit caps the Anthropic-spend abuse vector: each submission
// otherwise triggers a Haiku call. Backed by `feedback_rate_limits`
// (Phase 12 reconciliation migration). IP is read from cf-connecting-ip
// (Cloudflare-set, not spoofable from browser) with x-forwarded-for as
// fallback, then SHA-256 hashed before storage so raw IPs never persist.
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

// Phase 11 §B (2026-04-28): env reads moved inside handle() so unit tests
// can override values per-case via Deno.env.set / mockEnv (module-level
// reads happen once at import time and can't be re-stubbed). Edge runtime
// cost is negligible — env access is a hash lookup, called once per
// request after this change.

const VALID_CATEGORIES = new Set(["bug", "feature-request", "praise", "confusion", "other"]);
const VALID_PRIORITIES = new Set(["p0", "p1", "p2", "p3"]);

// Per-IP throttle. 5 submissions per 60s is enough for legitimate users
// to retry after a typo or revise their message; well below what a
// Claude-budget abuser would need.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 60;

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

// Phase 11 §B (2026-04-28): handler exported so tests can call it without
// spinning up a Deno.serve listener. Production behavior unchanged — the
// `if (import.meta.main)` guard at the bottom of the file invokes
// Deno.serve(handle) when the module is the entrypoint (Supabase Edge
// Functions run the file as main).
export async function handle(req: Request): Promise<Response> {
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") || "";

  // Per-IP throttle — checked BEFORE the Claude call so an abuser
  // can't spend our Anthropic budget faster than the rate allows.
  // Hash failures are non-fatal: we fall through to allow rather than
  // hard-deny on a hashing edge case.
  const ipHash = await hashIp(getClientIp(req));
  if (ipHash) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await admin
      .from("feedback_rate_limits")
      .select("ip_hash", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count || 0) >= RATE_LIMIT_MAX) {
      return json({ error: "rate limited. please wait a minute and try again." }, 429);
    }
    // Log the attempt now (before the Claude call) so concurrent submits
    // from the same IP race against the same window honestly. A failed
    // insert below doesn't roll this back, which is fine — we want to
    // count attempts, not just successes.
    await admin.from("feedback_rate_limits").insert({ ip_hash: ipHash });
  }

  // Optional Claude triage. Skipped silently if no API key or if the
  // call errors — feedback still lands in the table, just untriaged.
  let claude_summary: string | null = null;
  let claude_priority: string | null = null;
  if (anthropicKey) {
    try {
      const triage = await triageWithClaude(message, category, anthropicKey);
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
}

if (import.meta.main) {
  Deno.serve(handle);
}

async function triageWithClaude(
  message: string,
  category: string,
  apiKey: string,
): Promise<{ summary: string; priority: string } | null> {
  const client = new Anthropic({ apiKey });
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

// cf-connecting-ip is set by Cloudflare on every request and cannot be
// spoofed by the client. x-forwarded-for is the standard fallback for
// non-CF deploys; we take the first (left-most) entry which is the
// original client. "unknown" buckets all unattributable callers into a
// single shared rate-limit bucket — coarse but conservative.
function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

async function hashIp(ip: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
    const hex = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex.slice(0, 16);
  } catch {
    return "";
  }
}
