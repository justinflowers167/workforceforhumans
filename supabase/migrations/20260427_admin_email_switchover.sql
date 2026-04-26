-- 2026-04-27 — Admin email switchover.
-- Founder registered admin@workforceforhumans.com via Google Workspace
-- and is consolidating off the two personal emails that were used for
-- early testing:
--   - justinflowers2@gmail.com (KB editor allowlist seed)
--   - justinflowers@hotmail.com (test employer contact_email)
--
-- This migration handles the live data cutover. The Supabase Auth side
-- (auth.users rows + magic-link recipient mapping) is dashboard-driven
-- and documented in docs/operations-runbook.md §11 — this migration does
-- NOT touch auth.users.
--
-- Idempotent. Safe to re-run.

-- ── 1. KB editor allowlist ────────────────────────────────────────────
-- Replace the gmail seed with the new admin email. Done as INSERT-then-
-- DELETE (rather than UPDATE on the primary key) so each step is
-- independently idempotent if an earlier partial run landed only one
-- side. The kb-admin.html session check will rebind on next sign-in.

INSERT INTO public.kb_editor_emails (email, added_by)
VALUES ('admin@workforceforhumans.com', 'admin-email-switchover-2026-04-27')
ON CONFLICT (email) DO NOTHING;

DELETE FROM public.kb_editor_emails
WHERE lower(email) = 'justinflowers2@gmail.com';

-- ── 2. Test employer contact_email ────────────────────────────────────
-- The test employer row was created during Phase 3 with contact_email =
-- 'justinflowers@hotmail.com'. Stripe webhook confirmation emails (and
-- any future founder-driven employer-side comms) get sent to this
-- address, so flipping it to admin@ closes the personal-email loop.
--
-- The auth_user_id link on this row stays as-is — that's a Supabase
-- Auth concern (see runbook §11). Updating contact_email does not break
-- magic-link sign-in, because magic links go to auth.users.email, not
-- employers.contact_email.

UPDATE public.employers
SET contact_email = 'admin@workforceforhumans.com'
WHERE lower(contact_email) = 'justinflowers@hotmail.com';
