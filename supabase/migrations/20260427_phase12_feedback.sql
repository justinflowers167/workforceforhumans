-- Phase 12 — Feature depth, 2026-04-27.
-- Captures user feedback (bug reports, feature requests, praise, "this
-- confused me") from the floating widget injected by site.js on every
-- page. Founder reads via SQL editor (no admin UI in v1) — see
-- docs/operations-runbook.md §8 for the triage query.
--
-- The Edge Function `submit-feedback` (Phase 12 §B2) inserts here. RLS
-- intentionally allows anon INSERT but no SELECT — the service-role
-- runtime is the only thing that should ever read this table, mirroring
-- the existing `leads` / `partner_inquiries` posture.
--
-- claude_summary + claude_priority are populated by the Edge Function
-- when ANTHROPIC_API_KEY is set; null otherwise (graceful degradation).

create table if not exists public.feedback (
  id              uuid primary key default extensions.uuid_generate_v4(),
  page_path       text not null,
  category        text check (category in ('bug','feature-request','praise','confusion','other')),
  message         text not null check (length(message) between 5 and 2000),
  user_email      text,
  user_agent      text,
  claude_summary  text,
  claude_priority text check (claude_priority in ('p0','p1','p2','p3')),
  status          text not null default 'new' check (status in ('new','triaged','actioned','wont-fix','duplicate')),
  created_at      timestamptz not null default now()
);

-- Triage index: founder reads `where status = 'new' order by claude_priority asc, created_at desc`
-- once a week. Partial index keeps it small.
create index if not exists feedback_new_triage_idx
  on public.feedback (claude_priority asc, created_at desc)
  where status = 'new';

alter table public.feedback enable row level security;

-- Anonymous (browser) submissions are allowed. The check constraint on
-- the `message` column already enforces 5-2000 char bounds; rate limiting
-- is handled at the Edge Function layer (per-IP throttle).
drop policy if exists "feedback_insert_anon" on public.feedback;
create policy "feedback_insert_anon" on public.feedback
  for insert to public with check (true);

-- No SELECT policy = no anon/authenticated reads. Service role bypasses
-- RLS for the founder's SQL-editor reads.

comment on table public.feedback is 'Phase 12 §B: lightweight user feedback inbox. Reads service-role only.';
