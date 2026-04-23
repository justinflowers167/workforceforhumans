// Phase 8 — Launch Readiness, Mon 2026-04-20.
// Pulls WFH-relevant public roles from USAJobs.gov daily (wired Tue
// 2026-04-21 via pg_cron) and upserts them into public.jobs with
// source='usajobs'. Authenticated server-to-server via x-refresh-secret
// header — NOT user JWT — mirroring the send-match-digest pattern. Today's
// scaffold is a working 200-OK endpoint with full auth + env guards wired;
// the actual pull + Claude relevance filter + upsert ship Tuesday.

// Note: @supabase/supabase-js import and admin client instantiation arrive
// Tuesday with the upsert logic — scaffold doesn't need them yet.

const USAJOBS_AUTH_KEY = Deno.env.get("USAJOBS_AUTH_KEY") || "";
const USAJOBS_USER_AGENT = Deno.env.get("USAJOBS_USER_AGENT") || "";
const REFRESH_SECRET = Deno.env.get("REFRESH_SECRET") || "";

// Fixed UUID of the synthetic "USAJobs — external feed" employer row seeded
// by 20260420_phase8_jobs_external_source.sql. All source='usajobs' jobs use
// this as employer_id so the existing jobs.employer_id FK holds.
// Referenced by Tuesday's upsert logic — exported as a constant so the
// migration and the function agree on the ID.
// deno-lint-ignore no-unused-vars
const USAJOBS_EMPLOYER_ID = "00000000-0000-0000-0000-00000000a001";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-refresh-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Server-to-server auth. Cron fires with a pre-shared secret, not a user
    // JWT. Matches the send-match-digest DIGEST_SECRET pattern.
    const providedSecret = req.headers.get("x-refresh-secret") || "";
    if (!REFRESH_SECRET || providedSecret !== REFRESH_SECRET) {
      return json({ error: "unauthorized" }, 401);
    }

    // Credential guard. Scaffold deploys fine without these set so Monday can
    // hit the endpoint; the real pull tomorrow requires them.
    if (!USAJOBS_AUTH_KEY || !USAJOBS_USER_AGENT) {
      return json({ error: "USAJobs credentials not configured" }, 500);
    }

    // TODO (Tue 2026-04-21, ROADMAP.md Launch Readiness Week):
    //   1. Instantiate admin client:
    //      createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    //   2. Fetch https://data.usajobs.gov/api/search with Authorization-Key
    //      + User-Agent headers, filtered for RemoteIndicator=True,
    //      WhoMayApply=public, across 4 keyword buckets
    //      (analyst / specialist / coordinator / technician). Dedup
    //      candidates by MatchedObjectId.
    //   3. Per candidate, ask claude-sonnet-4-6 for a relevance filter
    //      ({keep:bool, reason:string}) in batches of 10. Cap to top 50.
    //   4. Upsert into public.jobs with source='usajobs',
    //      source_ref=MatchedObjectId, source_url=ApplyURI[0],
    //      employer_id=USAJOBS_EMPLOYER_ID. Idempotent on
    //      (source, source_ref) via jobs_source_ref_key unique index.
    //   5. Return { ok: true, considered, filtered, inserted }.
    //
    // Scaffold short-circuit: acknowledge auth + env are correct, report 0s.

    return json({
      ok: true,
      message: "refresh-jobs scaffold ready",
      considered: 0,
      filtered: 0,
      inserted: 0,
    });
  } catch (err) {
    console.error("refresh-jobs error:", err);
    return json({ error: "Refresh failed. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
