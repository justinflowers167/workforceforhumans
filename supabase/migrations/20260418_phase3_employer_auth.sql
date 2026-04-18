-- Phase 3 — employer auth linkage + subscription state + RLS for self-serve dashboard.
-- Pre-flight (run before applying): SELECT contact_email, COUNT(*) FROM employers GROUP BY 1 HAVING COUNT(*) > 1;
-- Confirmed empty 2026-04-18.

-- ── employers: auth linkage + subscription state + email uniqueness ──────────
ALTER TABLE public.employers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text
    CHECK (subscription_status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

ALTER TABLE public.employers
  ADD CONSTRAINT employers_contact_email_key UNIQUE (contact_email);

CREATE INDEX IF NOT EXISTS employers_subscription_status_idx
  ON public.employers (subscription_status) WHERE subscription_status IS NOT NULL;

-- Owner-side policies. RLS is already enabled and the existing
-- "Public can view employers" SELECT policy stays — homepage / jobs.html
-- still need it for the public employer name + logo on job cards.
CREATE POLICY "Employer owner can update self"
  ON public.employers FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ── auth.users → employers link trigger ─────────────────────────────────────
-- Fires synchronously at first OTP verification (auth.users insert).
-- SECURITY DEFINER + explicit search_path is mandatory: without it, a malicious
-- user could shadow public.employers with their own table.
CREATE OR REPLACE FUNCTION public.link_employer_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.employers
     SET auth_user_id = NEW.id,
         updated_at = now()
   WHERE lower(contact_email) = lower(NEW.email)
     AND auth_user_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_employer ON auth.users;
CREATE TRIGGER on_auth_user_created_link_employer
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_employer_to_auth_user();

-- ── jobs: owner policies for the dashboard ──────────────────────────────────
-- Existing "Public can view active jobs" stays — adds owner SELECT for drafts/paused.
CREATE POLICY "Employer owner can read own jobs"
  ON public.jobs FOR SELECT TO authenticated
  USING (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()));

CREATE POLICY "Employer owner can insert own jobs"
  ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()));

CREATE POLICY "Employer owner can update own jobs"
  ON public.jobs FOR UPDATE TO authenticated
  USING (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()))
  WITH CHECK (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()));

-- ── job_postings: owner UPDATE so dashboard can stamp job_id after creation ─
-- Existing "Employers can view own job postings" SELECT (matches by email)
-- continues to work; this adds an auth_user_id-based UPDATE.
CREATE POLICY "Employer owner can update own postings"
  ON public.job_postings FOR UPDATE TO authenticated
  USING (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()))
  WITH CHECK (employer_id IN (SELECT id FROM public.employers WHERE auth_user_id = auth.uid()));
