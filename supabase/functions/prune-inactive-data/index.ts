// Phase 9 — Soft Launch, 2026-04-27+.
// Retention-commitment enforcement.
//
// Backs the language in privacy.html §6 ("pruned during periodic review" /
// "older scores may be purged during periodic database maintenance") with an
// actual scheduled job. Runs weekly via pg_cron (see the companion migration
// 20260423_phase9_prune_inactive_data.sql).
//
// What it does:
//   1. Delete resumes rows where updated_at < now() - 24 months AND the
//      owning job_seekers row has had no sign-in activity in that same
//      window (auth.users.last_sign_in_at < cutoff, or null/unlinked).
//      Also deletes the backing storage object from the `resumes` bucket
//      for any row we remove, so the file isn't orphaned.
//   2. Delete match_scores rows where emailed_at < now() - 12 months.
//   3. Log counts to console.log for observability.
//
// Authenticated server-to-server via the x-prune-secret header — same shape
// as refresh-jobs and send-match-digest. PRUNE_SECRET is kept in vault.
//
// Safety notes:
//   - Never touches active accounts or recently-emailed matches.
//   - The resumes table FKs to job_seekers with ON DELETE CASCADE, so this
//     function does not need to touch job_seekers. We never delete seekers.
//   - Storage-object deletion is best-effort; if a file is already gone,
//     we swallow the error and move on so the DB delete still happens.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PRUNE_SECRET = Deno.env.get("PRUNE_SECRET") || "";

const RESUME_RETENTION_MONTHS = 24;
const MATCH_SCORE_RETENTION_MONTHS = 12;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-prune-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const provided = req.headers.get("x-prune-secret") || "";
  if (!PRUNE_SECRET || !timingSafeEqual(provided, PRUNE_SECRET)) return json({ error: "unauthorized" }, 401);

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Calendar-month cutoffs so the code matches the documented "24 months" /
    // "12 months" commitments in privacy.html §6 — 30-day arithmetic drifts
    // by ~10 days over 24 months. setUTCMonth handles month-length variance.
    const rd = new Date();
    rd.setUTCMonth(rd.getUTCMonth() - RESUME_RETENTION_MONTHS);
    const resumeCutoff = rd.toISOString();
    const md = new Date();
    md.setUTCMonth(md.getUTCMonth() - MATCH_SCORE_RETENTION_MONTHS);
    const matchCutoff = md.toISOString();

    // 1. Resumes: identify stale rows whose seekers haven't signed in.
    // auth.users is not exposed via supabase-js table builder; use the
    // admin auth API to resolve last_sign_in_at per seeker.
    const { data: staleResumes, error: rErr } = await admin
      .from("resumes")
      .select("id, job_seeker_id, file_path, updated_at, job_seekers(auth_user_id)")
      .lt("updated_at", resumeCutoff);
    if (rErr) throw rErr;

    const resumesToDelete: { id: string; file_path: string | null }[] = [];
    for (const row of staleResumes || []) {
      // @ts-ignore join shape
      const authId: string | null = row.job_seekers?.auth_user_id || null;
      let inactive = true;
      if (authId) {
        const { data: userData } = await admin.auth.admin.getUserById(authId);
        const lastSignIn = userData?.user?.last_sign_in_at || null;
        if (lastSignIn && new Date(lastSignIn).toISOString() >= resumeCutoff) {
          inactive = false;
        }
      }
      if (inactive) resumesToDelete.push({ id: row.id, file_path: row.file_path });
    }

    // Storage cleanup first — once the DB row is gone we lose the pointer.
    let storageDeleted = 0;
    let storageSkipped = 0;
    const paths = resumesToDelete
      .map((r) => r.file_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length) {
      const { data: removed, error: sErr } = await admin.storage.from("resumes").remove(paths);
      if (sErr) {
        console.error("prune-inactive-data: storage.remove error (continuing):", sErr);
        storageSkipped = paths.length;
      } else {
        storageDeleted = removed?.length || 0;
        storageSkipped = paths.length - storageDeleted;
      }
    }

    let resumesDeleted = 0;
    if (resumesToDelete.length) {
      const ids = resumesToDelete.map((r) => r.id);
      const { error: delErr, count } = await admin
        .from("resumes")
        .delete({ count: "exact" })
        .in("id", ids);
      if (delErr) throw delErr;
      resumesDeleted = count || 0;
    }

    // 2. Match scores: straight delete on emailed_at cutoff.
    const { error: mErr, count: matchCount } = await admin
      .from("match_scores")
      .delete({ count: "exact" })
      .lt("emailed_at", matchCutoff);
    if (mErr) throw mErr;
    const matchScoresDeleted = matchCount || 0;

    const result = {
      ok: true,
      resume_cutoff: resumeCutoff,
      match_cutoff: matchCutoff,
      resumes_considered: staleResumes?.length || 0,
      resumes_deleted: resumesDeleted,
      storage_files_deleted: storageDeleted,
      storage_files_skipped: storageSkipped,
      match_scores_deleted: matchScoresDeleted,
    };
    console.log("prune-inactive-data result:", JSON.stringify(result));
    return json(result);
  } catch (err) {
    console.error("prune-inactive-data error:", err);
    return json({ error: "Prune failed. Please try again." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Constant-time compare for shared-secret header auth — avoids timing side-channel.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
