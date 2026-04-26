-- Phase 3 — kb_editor_emails allowlist + tighten kb_articles write RLS.
-- Replaces the existing "any authenticated user" write policies with a
-- check that the signed-in user's email is on the allowlist.

CREATE TABLE IF NOT EXISTS public.kb_editor_emails (
  email text PRIMARY KEY,
  added_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_editor_emails ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read the list so kb-admin.html can self-check.
CREATE POLICY "kb_editor_emails read for authenticated"
  ON public.kb_editor_emails FOR SELECT TO authenticated
  USING (true);

-- No insert/update/delete policies → service-role only. Adds happen via SQL.

-- Bootstrap admin (idempotent).
-- Note: this seed value was originally `justinflowers2@gmail.com`; updated
-- 2026-04-27 to `admin@workforceforhumans.com` after Google Workspace setup.
-- Live cutover handled in `20260427_admin_email_switchover.sql` — that
-- migration is the source of truth for the live DB state. Editing this seed
-- only matters for fresh-from-scratch deploys against a clean Postgres.
INSERT INTO public.kb_editor_emails (email, added_by)
VALUES ('admin@workforceforhumans.com', 'phase-3-bootstrap')
ON CONFLICT (email) DO NOTHING;

-- Drop the open authenticated-write policies (names confirmed against
-- pg_policies on 2026-04-18).
DROP POLICY IF EXISTS "Authenticated users can insert kb articles" ON public.kb_articles;
DROP POLICY IF EXISTS "Authenticated users can update kb articles" ON public.kb_articles;
DROP POLICY IF EXISTS "Authenticated users can delete kb articles" ON public.kb_articles;

-- Allowlist-checked replacements. The lower() on both sides defends against
-- case mismatch between the JWT claim and the stored email.
CREATE POLICY "KB editors can insert"
  ON public.kb_articles FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt() ->> 'email') IN (SELECT lower(email) FROM public.kb_editor_emails));

CREATE POLICY "KB editors can update"
  ON public.kb_articles FOR UPDATE TO authenticated
  USING (lower(auth.jwt() ->> 'email') IN (SELECT lower(email) FROM public.kb_editor_emails))
  WITH CHECK (lower(auth.jwt() ->> 'email') IN (SELECT lower(email) FROM public.kb_editor_emails));

CREATE POLICY "KB editors can delete"
  ON public.kb_articles FOR DELETE TO authenticated
  USING (lower(auth.jwt() ->> 'email') IN (SELECT lower(email) FROM public.kb_editor_emails));

-- Existing "Public can view published kb articles" SELECT policy stays.
