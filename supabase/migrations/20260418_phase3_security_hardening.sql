-- Phase 3 hardening — close the three findings from the security review:
--   1. RLS on `jobs` lets any authenticated employer insert active+featured
--      listings with no payment. Fix: drop the owner INSERT/UPDATE policies
--      and route writes through SECURITY DEFINER RPCs that consume a paid
--      job_postings row OR verify an active subscription before insert.
--   2. RLS on `employers` lets owner overwrite Stripe billing columns
--      (subscription_status, subscription_id, etc.). Fix: BEFORE UPDATE
--      trigger blocks billing-column writes from authenticated/anon roles
--      (service_role and nested-trigger contexts pass through). Also add
--      a partial UNIQUE on subscription_id so two rows can't claim the
--      same Stripe sub.
--   3. RLS on `job_postings` lets owner flip status -> 'paid' and rewrite
--      plan/amount. Fix: drop the owner UPDATE policy entirely (the only
--      legitimate use was stamping job_id, now handled inside the
--      create_job_listing RPC), and add a defense-in-depth BEFORE UPDATE
--      trigger that blocks payment-column changes from non-service-role
--      callers in case a future policy reopens the surface.

-- ─── 1. employers: BEFORE UPDATE trigger to protect billing/identity ─────────
CREATE OR REPLACE FUNCTION public.protect_employer_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Pass through for the webhook (service_role) and any nested trigger
  -- context (e.g. the auth.users -> employers link trigger).
  IF auth.role() = 'service_role' OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_id IS DISTINCT FROM OLD.subscription_id
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_current_period_end IS DISTINCT FROM OLD.subscription_current_period_end
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR lower(NEW.contact_email) IS DISTINCT FROM lower(OLD.contact_email)
  THEN
    RAISE EXCEPTION 'Permission denied: cannot modify billing or identity columns from this role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_employer_billing ON public.employers;
CREATE TRIGGER protect_employer_billing
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.protect_employer_billing_columns();

-- Subscription IDs must be unique so an attacker can't shadow another employer's sub.
CREATE UNIQUE INDEX IF NOT EXISTS employers_subscription_id_uniq
  ON public.employers (subscription_id) WHERE subscription_id IS NOT NULL;

-- ─── 2. job_postings: drop owner UPDATE policy + protective trigger ─────────
DROP POLICY IF EXISTS "Employer owner can update own postings" ON public.job_postings;

CREATE OR REPLACE FUNCTION public.protect_job_postings_payment_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
     OR NEW.stripe_payment_id IS DISTINCT FROM OLD.stripe_payment_id
     OR NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id
     OR NEW.stripe_event_id IS DISTINCT FROM OLD.stripe_event_id
     OR NEW.employer_id IS DISTINCT FROM OLD.employer_id
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.listing_duration_days IS DISTINCT FROM OLD.listing_duration_days
  THEN
    RAISE EXCEPTION 'Permission denied: cannot modify payment columns on job_postings from this role'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_job_postings_payment ON public.job_postings;
CREATE TRIGGER protect_job_postings_payment
  BEFORE UPDATE ON public.job_postings
  FOR EACH ROW EXECUTE FUNCTION public.protect_job_postings_payment_columns();

-- ─── 3. jobs: drop owner INSERT/UPDATE; route through RPCs ──────────────────
DROP POLICY IF EXISTS "Employer owner can insert own jobs" ON public.jobs;
DROP POLICY IF EXISTS "Employer owner can update own jobs" ON public.jobs;
-- Keep "Employer owner can read own jobs" SELECT policy.

-- create_job_listing: consumes a paid posting OR verifies active subscription.
-- Returns the new jobs.id. is_featured is set server-side based on the
-- consumed posting's plan; client cannot self-promote.
CREATE OR REPLACE FUNCTION public.create_job_listing(
  p_payload jsonb,
  p_posting_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_employer_id uuid;
  v_posting_plan text;
  v_can_feature boolean := false;
  v_new_job_id uuid;
  v_slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_employer_id
    FROM public.employers
   WHERE auth_user_id = auth.uid();
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No employer linked to current user' USING ERRCODE = '42501';
  END IF;

  IF p_posting_id IS NOT NULL THEN
    -- Path A: consume a specific paid posting.
    SELECT plan INTO v_posting_plan
      FROM public.job_postings
     WHERE id = p_posting_id
       AND employer_id = v_employer_id
       AND status = 'paid'
       AND job_id IS NULL
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No paid unconsumed posting % for this employer', p_posting_id
        USING ERRCODE = '42501';
    END IF;
    v_can_feature := (v_posting_plan = 'featured');
  ELSE
    -- Path B: must have an active subscription.
    IF NOT EXISTS (
      SELECT 1 FROM public.employers
       WHERE id = v_employer_id
         AND subscription_status IN ('active','trialing')
    ) THEN
      RAISE EXCEPTION 'No paid posting and no active subscription' USING ERRCODE = '42501';
    END IF;
    -- Subscription listings are not auto-featured.
    v_can_feature := false;
  END IF;

  -- Slug from payload, or derived from title with random suffix to avoid collisions.
  v_slug := nullif(p_payload->>'slug', '');
  IF v_slug IS NULL THEN
    v_slug := lower(regexp_replace(coalesce(p_payload->>'title',''), '[^a-z0-9]+', '-', 'g'))
              || '-' || substring(replace(gen_random_uuid()::text,'-','') for 5);
    v_slug := regexp_replace(v_slug, '(^-|-$)', '', 'g');
  END IF;

  INSERT INTO public.jobs (
    employer_id, title, description, slug, status,
    responsibilities, requirements, nice_to_have,
    location_city, location_state, is_remote, is_hybrid, is_onsite,
    employment_type, experience_level,
    pay_type, pay_min, pay_max,
    apply_url, apply_email,
    is_featured
  ) VALUES (
    v_employer_id,
    nullif(p_payload->>'title',''),
    nullif(p_payload->>'description',''),
    v_slug,
    'active',
    coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'responsibilities')), ARRAY[]::text[]),
    coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'requirements')),    ARRAY[]::text[]),
    coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'nice_to_have')),    ARRAY[]::text[]),
    nullif(p_payload->>'location_city',''),
    nullif(p_payload->>'location_state',''),
    coalesce((p_payload->>'is_remote')::boolean, false),
    coalesce((p_payload->>'is_hybrid')::boolean, false),
    coalesce((p_payload->>'is_onsite')::boolean, true),
    coalesce(nullif(p_payload->>'employment_type',''),  'full-time'),
    coalesce(nullif(p_payload->>'experience_level',''), 'no-requirement'),
    coalesce(nullif(p_payload->>'pay_type',''),         'hourly'),
    nullif(p_payload->>'pay_min','')::numeric,
    nullif(p_payload->>'pay_max','')::numeric,
    nullif(p_payload->>'apply_url',''),
    nullif(p_payload->>'apply_email',''),
    v_can_feature
  )
  RETURNING id INTO v_new_job_id;

  -- Atomically link the posting (if used). The protect trigger allows job_id
  -- changes since it's not in the protected column list.
  IF p_posting_id IS NOT NULL THEN
    UPDATE public.job_postings
       SET job_id = v_new_job_id
     WHERE id = p_posting_id;
  END IF;

  RETURN v_new_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_job_listing(jsonb, uuid) TO authenticated;

-- update_job_listing: edit any non-billing field of an owned job. is_featured
-- is intentionally never overwritten here — once granted by paid posting, it
-- stays; the user cannot self-promote via edit.
CREATE OR REPLACE FUNCTION public.update_job_listing(
  p_job_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_employer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_employer_id
    FROM public.employers
   WHERE auth_user_id = auth.uid();
  IF v_employer_id IS NULL THEN
    RAISE EXCEPTION 'No employer linked to current user' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs
     WHERE id = p_job_id AND employer_id = v_employer_id
  ) THEN
    RAISE EXCEPTION 'Job % not found or not owned', p_job_id USING ERRCODE = '42501';
  END IF;

  UPDATE public.jobs SET
    title            = coalesce(nullif(p_payload->>'title',''),         title),
    description      = coalesce(nullif(p_payload->>'description',''),   description),
    responsibilities = coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'responsibilities')), responsibilities),
    requirements     = coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'requirements')),     requirements),
    nice_to_have     = coalesce((SELECT array_agg(value) FROM jsonb_array_elements_text(p_payload->'nice_to_have')),     nice_to_have),
    location_city    = coalesce(nullif(p_payload->>'location_city',''),  location_city),
    location_state   = coalesce(nullif(p_payload->>'location_state',''), location_state),
    is_remote        = coalesce((p_payload->>'is_remote')::boolean,      is_remote),
    is_hybrid        = coalesce((p_payload->>'is_hybrid')::boolean,      is_hybrid),
    is_onsite        = coalesce((p_payload->>'is_onsite')::boolean,      is_onsite),
    employment_type  = coalesce(nullif(p_payload->>'employment_type',''),  employment_type),
    experience_level = coalesce(nullif(p_payload->>'experience_level',''), experience_level),
    pay_type         = coalesce(nullif(p_payload->>'pay_type',''),         pay_type),
    pay_min          = coalesce(nullif(p_payload->>'pay_min','')::numeric, pay_min),
    pay_max          = coalesce(nullif(p_payload->>'pay_max','')::numeric, pay_max),
    apply_url        = coalesce(nullif(p_payload->>'apply_url',''),        apply_url),
    apply_email      = coalesce(nullif(p_payload->>'apply_email',''),      apply_email),
    -- Status: only allow active <-> paused. Reject other transitions.
    status           = CASE
                         WHEN p_payload ? 'status' AND p_payload->>'status' IN ('active','paused')
                           THEN p_payload->>'status'
                         ELSE status
                       END,
    updated_at       = now()
   WHERE id = p_job_id AND employer_id = v_employer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_job_listing(uuid, jsonb) TO authenticated;
