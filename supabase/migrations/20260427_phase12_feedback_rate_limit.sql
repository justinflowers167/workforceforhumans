-- Phase 12 reconciliation, 2026-04-27.
-- Backs the per-IP throttle in `submit-feedback`. Phases 11 and 12 ran
-- as parallel tracks; the original Phase 12 migration comment for the
-- `feedback` table claimed "rate limiting is handled at the Edge
-- Function layer (per-IP throttle)" but the function shipped without
-- one. This migration adds the table the function reads/writes, and
-- the matching submit-feedback rewrite enforces ≤5 submissions per IP
-- per 60s before any Claude triage call fires (cap on the abuse vector
-- against the Anthropic budget).
--
-- Storage shape: SHA-256 hex truncated to 16 chars, not the raw IP.
-- Keeps the table small, avoids retaining raw IPs longer than needed.
-- 60-second window is enforced in code via `created_at >= now() - interval '60 seconds'`.
--
-- RLS posture mirrors `stripe_webhook_events`: enabled, no policies =
-- service-role only. The Edge Function uses the service-role client
-- and bypasses RLS. No browser surface.

create table if not exists public.feedback_rate_limits (
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);

-- Triage index: lookup is "rows for ip_hash X within last 60s",
-- so order by created_at desc keeps the index scan cheap.
create index if not exists feedback_rate_limits_ip_window_idx
  on public.feedback_rate_limits (ip_hash, created_at desc);

alter table public.feedback_rate_limits enable row level security;
-- Intentionally no policies. Service role only.

comment on table public.feedback_rate_limits is
  'Phase 12 reconciliation: per-IP throttle backing for submit-feedback. SHA-256 hashed IPs only.';
