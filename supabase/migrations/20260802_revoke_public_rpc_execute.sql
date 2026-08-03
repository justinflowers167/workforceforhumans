-- 2026-08-02 — Revoke public EXECUTE on SECURITY DEFINER functions
--
-- WHY (P0): `public.upsert_usajobs(rows jsonb)` is SECURITY DEFINER and had
-- EXECUTE granted to `anon`. The anon key is shipped in every page's HTML by
-- design, so ANY internet user could POST to
--   /rest/v1/rpc/upsert_usajobs
-- and insert rows straight into `public.jobs` with attacker-controlled
-- `title`, `description`, and `apply_url`, at status='active', bypassing RLS.
-- Those rows surface in `jobs_full` on the public homepage and jobs page.
-- Against this audience (displaced workers hunting for work) that is a
-- ready-made phishing distribution channel, not just a data-integrity bug.
-- Verified reachable on 2026-08-02: an anon-key POST with `{"rows":[]}`
-- returned HTTP 200.
--
-- `refresh-jobs` (the only legitimate caller) invokes this RPC with the
-- service-role client, so the daily cron is unaffected by these revokes.
--
-- The remaining functions below are trigger functions that were never meant to
-- be reachable over PostgREST. Calling one directly errors out ("can only be
-- called as a trigger"), so this is hygiene rather than an open hole — but it
-- clears the matching Supabase advisor findings and shrinks the exposed API.

-- ── The actual hole ─────────────────────────────────────────────────────────
revoke all on function public.upsert_usajobs(rows jsonb) from anon, authenticated, public;
grant execute on function public.upsert_usajobs(rows jsonb) to service_role;

-- ── Trigger functions that should never have been in the exposed API ────────
revoke all on function public.flip_other_current_resumes() from anon, authenticated, public;
revoke all on function public.handle_new_auth_user() from anon, authenticated, public;
revoke all on function public.link_employer_to_auth_user() from anon, authenticated, public;
revoke all on function public.protect_employer_billing_columns() from anon, authenticated, public;
revoke all on function public.protect_job_postings_payment_columns() from anon, authenticated, public;

-- Triggers execute as the table owner regardless of EXECUTE grants, so the
-- resume one-current invariant, the employer auth linkage, and the billing /
-- payment column guards all keep working after these revokes.

-- ── Deliberately left alone ─────────────────────────────────────────────────
-- `create_job_listing` and `update_job_listing` keep EXECUTE for
-- `authenticated`: employer.html calls them directly from the browser and they
-- do their own ownership checks internally. They are already not granted to
-- `anon`.
