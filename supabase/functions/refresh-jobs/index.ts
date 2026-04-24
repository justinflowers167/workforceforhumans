// Phase 8 — Launch Readiness, Tue 2026-04-21.
// Daily USAJobs.gov → public.jobs pipeline.
//
// NOTE: "WFH" throughout this file means Workforce for Humans (the product),
// NOT work-from-home. Onsite, hybrid, and remote roles are all in scope —
// the audience includes displaced workers who will commute or relocate.
//
//   1. Fetch public roles across WFH-audience keyword buckets (federal
//      job-series-aligned phrases like "management analyst", "contract
//      specialist") from data.usajobs.gov. Dedup by MatchedObjectId.
//   2. Run each candidate through claude-sonnet-4-6 as a WFH-relevance
//      filter ({keep, reason}). Permissive on filter errors so the feed
//      doesn't starve if Claude hiccups. If ANTHROPIC_API_KEY is not set,
//      skip the filter entirely and take top-N by posted date.
//   3. Top-N by posted date, bulk upsert via the public.upsert_usajobs RPC
//      (security-definer; service-role only; resolves the partial unique
//      index on (source, source_ref) where source_ref is not null).
//
// Authenticated server-to-server via the x-refresh-secret header — not a
// user JWT — mirroring the send-match-digest pattern. Scheduled daily at
// 11 UTC (7am EDT) by pg_cron (see 20260421_phase8_refresh_jobs_pipeline).

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.32.1?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const USAJOBS_AUTH_KEY = Deno.env.get("USAJOBS_AUTH_KEY") || "";
const USAJOBS_USER_AGENT = Deno.env.get("USAJOBS_USER_AGENT") || "";
const REFRESH_SECRET = Deno.env.get("REFRESH_SECRET") || "";

// Phase 9 tuning (2026-04-23): two problems with the original fetch —
//   (a) single-word buckets ("specialist", "technician") pulled physician-
//       heavy results, diluting relevance;
//   (b) the URL carried RemoteIndicator=True, restricting to remote-only
//       roles even though the WFH (Workforce for Humans) audience includes
//       workers fine with onsite / hybrid / relocation.
// Combined, those two left only 7 unique rows per day. Fix: swap to
// federal GS job-series-aligned phrases (0343 mgmt/program analysis, 1102
// contract, 0560 budget, 0201 HR, 2210 IT, 0301 admin) AND drop the
// RemoteIndicator filter. The per-row is_remote flag is still derived
// downstream in normalizeUSAJobsItem, so card chips stay accurate.
// Keeps the function ANTHROPIC_API_KEY-optional.
const KEYWORD_BUCKETS = [
  "management analyst",
  "program analyst",
  "budget analyst",
  "contract specialist",
  "human resources",
  "information technology specialist",
  "administrative",
  "project coordinator",
];
const RESULTS_PER_BUCKET = 50;
const MAX_KEEP = 50;
const CLAUDE_BATCH = 10;
const MODEL = "claude-sonnet-4-6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-secret",
};

const RELEVANCE_PROMPT = `You are a relevance filter for Workforce for Humans — a platform serving displaced workers and career changers (people affected by layoffs, AI/automation displacement, or mid-career transitions).

For each job, decide if it's a realistic fit for that audience:
- Entry-to-mid-level (NOT requiring PhD, NOT requiring decade-plus specialized experience).
- Any work location — onsite, hybrid, or remote all qualify; the audience includes workers who will commute or relocate.
- Skills-based hiring friendly (credential-gated roles like "must hold current TS/SCI clearance" are OK — the audience includes veterans and federal workers).
- Real foothold — a genuine opening someone could apply to, not a placeholder posting.

Return ONLY valid JSON in this exact shape:
{"decisions":[{"job_id":"<id>","keep":true|false,"reason":"<8-15 word reason>"}]}

No prose before or after the JSON.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Server-to-server auth — cron fires with the pre-shared secret.
    const providedSecret = req.headers.get("x-refresh-secret") || "";
    if (!REFRESH_SECRET || providedSecret !== REFRESH_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    if (!USAJOBS_AUTH_KEY || !USAJOBS_USER_AGENT) {
      return json({ error: "USAJobs credentials not configured" }, 500);
    }

    // ANTHROPIC_API_KEY is OPTIONAL. When absent, we skip the relevance
    // filter and just take top-N by posted_at — infrastructure works
    // end-to-end without Claude, quality improves when the key is added.
    const useClaudeFilter = !!ANTHROPIC_API_KEY;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const anthropic = useClaudeFilter ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

    // 1. Fetch across keyword buckets.
    const raw: any[] = [];
    for (const kw of KEYWORD_BUCKETS) {
      const items = await fetchBucket(kw);
      raw.push(...items);
    }

    // 2. Dedup by MatchedObjectId, normalize to jobs-row shape.
    const seen = new Set<string>();
    const candidates: any[] = [];
    for (const item of raw) {
      const id = String(item?.MatchedObjectId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const norm = normalizeUSAJobsItem(item);
      if (norm) candidates.push(norm);
    }

    const considered = candidates.length;
    if (considered === 0) {
      return json({ ok: true, considered: 0, filtered: 0, inserted: 0, note: "empty fetch" });
    }

    // 3. Relevance filter — Claude if the key is set, otherwise pass all
    // candidates through. Permissive fallback on Claude error (an empty
    // feed is worse than a degraded one). Track failure rate so the
    // response surfaces `degraded: true` when monitoring should alert.
    const keeps = new Set<string>();
    let totalBatches = 0;
    let failedBatches = 0;
    if (useClaudeFilter && anthropic) {
      for (let i = 0; i < candidates.length; i += CLAUDE_BATCH) {
        totalBatches += 1;
        const batch = candidates.slice(i, i + CLAUDE_BATCH);
        try {
          const batchKeeps = await filterBatch(anthropic, batch);
          for (const id of batchKeeps) keeps.add(id);
        } catch (err) {
          failedBatches += 1;
          console.error("Claude filter batch failed; keeping batch verbatim:", err);
          for (const j of batch) keeps.add(j.source_ref);
        }
      }
    } else {
      // No Claude key — unfiltered pass-through. All candidates are kept;
      // the top-N-by-date cap below keeps the daily output bounded to 50.
      for (const c of candidates) keeps.add(c.source_ref);
      console.log("refresh-jobs: ANTHROPIC_API_KEY not set, skipping relevance filter");
    }
    const failureRate = totalBatches ? failedBatches / totalBatches : 0;
    const degraded = totalBatches > 0 && failedBatches * 2 >= totalBatches;
    console.log(`refresh-jobs filter: mode=${useClaudeFilter ? "claude" : "none"} batches=${totalBatches} failed=${failedBatches} rate=${failureRate.toFixed(2)} degraded=${degraded}`);

    // 4. Keep the filter decisions, sort by posted date desc, cap at MAX_KEEP.
    const kept = candidates
      .filter((c) => keeps.has(c.source_ref))
      .sort((a, b) => String(b.posted_at || "").localeCompare(String(a.posted_at || "")))
      .slice(0, MAX_KEEP);

    // 5. Bulk upsert via RPC.
    let inserted = 0;
    if (kept.length) {
      const { data, error } = await admin.rpc("upsert_usajobs", { rows: kept });
      if (error) {
        console.error("upsert_usajobs RPC failed:", error);
        return json({ error: "Upsert failed" }, 500);
      }
      inserted = typeof data === "number" ? data : kept.length;
    }

    return json({
      ok: true,
      considered,
      filtered: kept.length,
      inserted,
      filter: useClaudeFilter ? "claude" : "none",
      degraded,
      failed_batches: failedBatches,
      total_batches: totalBatches,
    });
  } catch (err) {
    console.error("refresh-jobs error:", err);
    return json({ error: "Refresh failed. Please try again." }, 500);
  }
});

async function fetchBucket(keyword: string): Promise<any[]> {
  // NOTE: RemoteIndicator is intentionally omitted — onsite/hybrid roles are
  // in scope for the WFH (Workforce for Humans) audience. is_remote is
  // derived per-row downstream from the location text for display chips.
  const url = `https://data.usajobs.gov/api/search?Keyword=${encodeURIComponent(keyword)}&ResultsPerPage=${RESULTS_PER_BUCKET}&WhoMayApply=public`;
  const resp = await fetch(url, {
    headers: {
      "Authorization-Key": USAJOBS_AUTH_KEY,
      "User-Agent": USAJOBS_USER_AGENT,
      "Host": "data.usajobs.gov",
    },
  });
  if (!resp.ok) {
    console.error(`USAJobs fetch failed for "${keyword}": HTTP ${resp.status}`);
    return [];
  }
  const data = await resp.json();
  return data?.SearchResult?.SearchResultItems || [];
}

function slugify(s: string, maxLen = 60): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLen);
}

function normalizeUSAJobsItem(item: any): any | null {
  const d = item?.MatchedObjectDescriptor || {};
  const sourceRef = String(item?.MatchedObjectId || "");
  if (!sourceRef) return null;
  const title = String(d.PositionTitle || "").trim();
  if (!title) return null;

  const loc = (Array.isArray(d.PositionLocation) && d.PositionLocation[0]) || {};
  const pay = Array.isArray(d.PositionRemuneration) && d.PositionRemuneration[0];

  const locStr = (d.PositionLocationDisplay || "") + " " +
    (Array.isArray(d.PositionLocation) ? d.PositionLocation.map((l: any) => l.LocationName || "").join(" ") : "");
  const isRemote = /remote|telework|anywhere/i.test(locStr);

  const rawDesc = d?.UserArea?.Details?.JobSummary || d.QualificationSummary || title;
  const description = String(rawDesc).replace(/<[^>]+>/g, "").slice(0, 4000);

  const schedName = String(d?.PositionSchedule?.[0]?.Name || "").toLowerCase();
  const employmentType = schedName.includes("part") ? "part-time" :
    schedName.includes("intermitt") ? "contract" :
    "full-time";

  // pay_type mapping for USAJobs RateIntervalCode. Anything unknown falls
  // back to salary. WC (without compensation) nulls the pay range so the
  // card doesn't render a misleading $0.
  const rateCode = pay ? String(pay.RateIntervalCode || "").toUpperCase() : "";
  const payType = rateCode === "PH" ? "hourly" : "salary";
  const payMinRaw = pay && rateCode !== "WC" ? parseFloat(pay.MinimumRange) : NaN;
  const payMaxRaw = pay && rateCode !== "WC" ? parseFloat(pay.MaximumRange) : NaN;

  return {
    source_ref: sourceRef,
    title,
    // Slug namespace "ext-usajobs-<sourceRef>" is guaranteed-unique by
    // construction: sourceRef is USAJobs's 9-digit MatchedObjectId, and
    // "ext-" is a prefix employers' slugify(title) cannot produce. This
    // avoids the rare case where an employer-authored slug collides with
    // a USAJobs row and fails the whole RPC on the jobs_slug_key unique
    // constraint.
    slug: `ext-usajobs-${sourceRef}`,
    description,
    location_city: loc.CityName || null,
    location_state: loc.CountrySubDivisionCode || null,
    is_remote: isRemote,
    employment_type: employmentType,
    experience_level: inferExperienceLevel(d?.JobGrade),
    pay_type: payType,
    pay_min: Number.isFinite(payMinRaw) ? payMinRaw : null,
    pay_max: Number.isFinite(payMaxRaw) ? payMaxRaw : null,
    apply_url: (Array.isArray(d.ApplyURI) && d.ApplyURI[0]) || d.PositionURI || null,
    source_url: d.PositionURI || null,
    posted_at: d.PublicationStartDate || null,
  };
}

function inferExperienceLevel(grades: unknown): string {
  // USAJobs grades: GS (General Schedule) 1-15, FV (FAA), FG variants, etc.
  // Career-ladder postings list MULTIPLE grades like ["7","9","11"] — the
  // entry point (minimum) is the honest experience level to show a WFH
  // audience member, not the ceiling. Fall back to entry-level when we
  // can't parse (makes the filter generous).
  const arr = Array.isArray(grades) ? grades : (grades ? [grades] : []);
  const nums = arr
    .map((g: any) => {
      const code = String(g?.Code ?? g ?? "");
      const m = /(\d+)/.exec(code);
      return m ? parseInt(m[1], 10) : NaN;
    })
    .filter((n: number) => Number.isFinite(n));
  if (!nums.length) return "entry-level";
  const n = Math.min(...nums);
  if (n <= 7) return "entry-level";
  if (n <= 12) return "mid-level";
  return "senior";
}

async function filterBatch(client: Anthropic, batch: any[]): Promise<Set<string>> {
  const payload = batch.map((j) => ({
    job_id: j.source_ref,
    title: j.title,
    location: [j.location_city, j.location_state].filter(Boolean).join(", "),
    is_remote: j.is_remote,
    experience_level: j.experience_level,
    summary: String(j.description || "").slice(0, 500),
  }));
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: RELEVANCE_PROMPT,
    messages: [{ role: "user", content: JSON.stringify({ jobs: payload }) }],
  });
  const raw = resp.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  const s = raw.indexOf("{");
  const e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) return new Set();
  let parsed: any;
  try {
    parsed = JSON.parse(raw.slice(s, e + 1));
  } catch {
    return new Set();
  }
  const keeps = new Set<string>();
  for (const d of parsed?.decisions || []) {
    if (d?.keep) keeps.add(String(d.job_id));
  }
  return keeps;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
