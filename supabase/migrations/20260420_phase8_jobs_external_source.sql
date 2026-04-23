-- Phase 8 — Launch Readiness, Mon 2026-04-20.
-- Jobs external-source foundation: source/source_url/source_ref columns on
-- public.jobs, plus a synthetic external-feed employer row so refresh-jobs
-- (USAJobs.gov daily pull, wired Tue 2026-04-21) can upsert without loosening
-- the jobs.employer_id FK. jobs_full view is unaffected — additive columns,
-- no ripple until Tuesday's frontend work.
--
-- Additive + idempotent. Safe to reapply.

alter table public.jobs add column if not exists source text not null default 'employer';
alter table public.jobs add column if not exists source_url text;
alter table public.jobs add column if not exists source_ref text;

alter table public.jobs drop constraint if exists jobs_source_check;
alter table public.jobs add constraint jobs_source_check check (source in ('employer', 'usajobs'));

-- Partial unique index so refresh-jobs can upsert idempotently on the external
-- feed ID without colliding with the many employer-sourced rows that leave
-- source_ref null.
create unique index if not exists jobs_source_ref_key
  on public.jobs (source, source_ref)
  where source_ref is not null;

comment on column public.jobs.source is
  'Origin of this row. ''employer'' = paid verified posting created via stripe-webhook + employer.html. ''usajobs'' = pulled by refresh-jobs from USAJobs.gov. Other aggregator sources may be added later with matching CHECK constraint updates.';
comment on column public.jobs.source_url is
  'External apply URL when source != ''employer''. Null for employer-sourced rows (which apply in-platform).';
comment on column public.jobs.source_ref is
  'External feed unique identifier. Null for employer-sourced rows. Populated on aggregated sources so refresh jobs can upsert idempotently via jobs_source_ref_key.';

-- Synthetic external-feed employer. Fixed UUID so refresh-jobs references it
-- unambiguously from code. Required columns on public.employers today: id
-- (default gen), name, slug (unique), contact_email. All other columns
-- nullable. on conflict (id) do nothing keeps this idempotent.
--
-- MAGIC CONSTANT — must stay in lockstep with these two other references:
--   - supabase/migrations/20260421_phase8_refresh_jobs_pipeline.sql (RPC default)
--   - supabase/migrations/20260422_phase8_qa_hotfix.sql (RPC default, posted_at clamp)
-- Drift fails loudly at the jobs.employer_id FK constraint.
insert into public.employers (id, name, slug, contact_email)
values (
  '00000000-0000-0000-0000-00000000a001'::uuid,
  'USAJobs — external feed',
  'usajobs-external',
  'external-feed@workforceforhumans.com'
)
on conflict (id) do nothing;
