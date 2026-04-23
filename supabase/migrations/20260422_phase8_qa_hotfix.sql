-- Phase 8 QA hotfix — 2026-04-22.
-- Security review (Low finding): USAJobs rows with bogus future PublicationStartDate
-- values would pin a row to the top of jobs_full forever (since our feed sorts
-- desc by posted_at). Clamp posted_at to least(supplied, now()) inside the
-- upsert_usajobs RPC so feed-poisoning via upstream date tampering is a
-- no-op.
--
-- Body is identical to the 20260421 definition except for the posted_at line.
-- CREATE OR REPLACE keeps the grants + search_path + security definer from
-- the original migration intact.

create or replace function public.upsert_usajobs(rows jsonb)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  cnt int := 0;
begin
  with up as (
    insert into public.jobs (
      employer_id, title, slug, description,
      location_city, location_state,
      is_remote, is_onsite, is_hybrid,
      employment_type, experience_level, education_required,
      pay_type, pay_min, pay_max,
      apply_url, apply_via_platform,
      status, posted_at, expires_at,
      source, source_url, source_ref
    )
    select
      -- Synthetic USAJobs external-feed employer. MAGIC CONSTANT — must stay
      -- in lockstep with the seed in 20260420_phase8_jobs_external_source.sql
      -- and the RPC body in 20260421_phase8_refresh_jobs_pipeline.sql. Drift
      -- fails loudly at the jobs.employer_id FK constraint.
      '00000000-0000-0000-0000-00000000a001'::uuid,
      coalesce(nullif(r->>'title',''), 'Untitled role'),
      r->>'slug',
      coalesce(nullif(r->>'description',''), r->>'title', 'See USAJobs listing'),
      nullif(r->>'location_city',''),
      nullif(r->>'location_state',''),
      coalesce((r->>'is_remote')::boolean, false),
      not coalesce((r->>'is_remote')::boolean, false),
      false,
      coalesce(nullif(r->>'employment_type',''), 'full-time'),
      coalesce(nullif(r->>'experience_level',''), 'entry-level'),
      'no-requirement',
      coalesce(nullif(r->>'pay_type',''), 'salary'),
      nullif(r->>'pay_min','')::numeric,
      nullif(r->>'pay_max','')::numeric,
      nullif(r->>'apply_url',''),
      false,
      'active',
      -- Hotfix: clamp to now() so feed-poisoning via future-dated upstream
      -- PublicationStartDate is a no-op. Null still falls back to now().
      least(
        coalesce(nullif(r->>'posted_at','')::timestamptz, now()),
        now()
      ),
      now() + interval '60 days',
      'usajobs',
      nullif(r->>'source_url',''),
      r->>'source_ref'
    from jsonb_array_elements(rows) r
    where coalesce(r->>'source_ref','') <> ''
    on conflict (source, source_ref) where source_ref is not null
    do update set
      title = excluded.title,
      description = excluded.description,
      location_city = excluded.location_city,
      location_state = excluded.location_state,
      is_remote = excluded.is_remote,
      is_onsite = excluded.is_onsite,
      pay_min = excluded.pay_min,
      pay_max = excluded.pay_max,
      apply_url = excluded.apply_url,
      source_url = excluded.source_url,
      posted_at = excluded.posted_at,
      expires_at = excluded.expires_at,
      status = 'active',
      updated_at = now()
    returning 1
  )
  select count(*) into cnt from up;
  return cnt;
end;
$fn$;

-- CREATE OR REPLACE preserves the grant chain from 20260421 but re-assert
-- for safety — idempotent.
revoke all on function public.upsert_usajobs(jsonb) from public;
grant execute on function public.upsert_usajobs(jsonb) to service_role;
