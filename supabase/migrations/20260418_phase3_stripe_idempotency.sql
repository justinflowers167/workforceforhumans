-- Phase 3 — Stripe webhook idempotency. Audit table is the primary lock;
-- job_postings.stripe_event_id is a denormalized backref + defense-in-depth.

ALTER TABLE public.job_postings
  ADD COLUMN IF NOT EXISTS stripe_event_id text;

CREATE UNIQUE INDEX IF NOT EXISTS job_postings_stripe_event_id_uniq
  ON public.job_postings (stripe_event_id) WHERE stripe_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed','skipped')),
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_event_type_idx
  ON public.stripe_webhook_events (event_type);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_failed_idx
  ON public.stripe_webhook_events (status) WHERE status <> 'success';

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies → service-role only. The browser never reads this table.
