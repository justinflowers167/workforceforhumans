-- Phase 8 — Launch Readiness, Tue 2026-04-21.
-- Activates the refresh-jobs daily pipeline:
--   1. Enable pg_cron + pg_net (idempotent).
--   2. Recompile jobs_full view to expose source/source_url/source_ref
--      columns — appended at the end of the column list since CREATE OR
--      REPLACE VIEW cannot reorder columns.
--   3. Create upsert_usajobs(rows jsonb) RPC — security-definer, service-role
--      only — so the Edge Function can bulk-upsert against the partial unique
--      index jobs_source_ref_key without fighting supabase-js's conflict target.
--   4. Schedule cron.schedule('refresh-jobs-daily') at 11 UTC (7am ET) reading
--      REFRESH_SECRET from vault. Vault seeding happens out-of-band via
--      execute_sql so the secret stays out of git.
--
-- Additive + idempotent. Safe to reapply.

-- 1. Extensions
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. jobs_full view recompile. New columns (source / source_url / source_ref)
-- appended at the END because CREATE OR REPLACE VIEW preserves column order
-- and rejects position changes.
create or replace view public.jobs_full as
  select
    j.id,
    j.employer_id,
    j.category_id,
    j.title,
    j.slug,
    j.description,
    j.responsibilities,
    j.requirements,
    j.nice_to_have,
    j.location_city,
    j.location_state,
    j.location_zip,
    j.is_remote,
    j.is_hybrid,
    j.is_onsite,
    j.employment_type,
    j.experience_level,
    j.education_required,
    j.pay_type,
    j.pay_min,
    j.pay_max,
    j.pay_currency,
    j.benefits,
    j.apply_url,
    j.apply_email,
    j.apply_via_platform,
    j.status,
    j.is_featured,
    j.is_entry_level_highlighted,
    j.is_senior_friendly,
    j.meta_title,
    j.meta_description,
    j.view_count,
    j.application_count,
    j.posted_at,
    j.expires_at,
    j.filled_at,
    j.created_at,
    j.updated_at,
    e.name as employer_name,
    e.slug as employer_slug,
    e.logo_url as employer_logo,
    e.is_verified as employer_verified,
    e.location_city as employer_city,
    e.location_state as employer_state,
    c.name as category_name,
    c.slug as category_slug,
    c.icon as category_icon,
    j.source,
    j.source_url,
    j.source_ref
  from public.jobs j
    left join public.employers e on e.id = j.employer_id
    left join public.categories c on c.id = j.category_id
  where j.status = 'active'::text and j.expires_at > now();

-- 3. RPC: bulk upsert of USAJobs rows. Accepts jsonb array from the Edge
-- Function, resolves the partial unique index conflict in raw SQL (supabase-js
-- can't target partial indexes via its onConflict helper), and returns the
-- count of rows inserted or updated. security definer so the function runs
-- with the owner's privileges; execute is granted only to service_role so
-- browser anon/authenticated roles can't spam USAJobs rows.
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
      coalesce(nullif(r->>'posted_at','')::timestamptz, now()),
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

revoke all on function public.upsert_usajobs(jsonb) from public;
grant execute on function public.upsert_usajobs(jsonb) to service_role;

comment on function public.upsert_usajobs(jsonb) is
  'Phase 8 Tue: bulk upsert of USAJobs.gov rows from the refresh-jobs Edge Function. Security definer + service_role-only execute grant. Uses the jobs_source_ref_key partial unique index for idempotency.';

-- 4. Daily schedule. Reschedule is idempotent — unschedule any prior job
-- with the same name first, then create the fresh entry. Reads REFRESH_SECRET
-- from vault at run time; vault seeding happens out-of-band via execute_sql.
do $unschedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'refresh-jobs-daily';
exception when others then null;
end $unschedule$;

select cron.schedule(
  'refresh-jobs-daily',
  '0 11 * * *',
  $sched$
  select net.http_post(
    url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/refresh-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refresh-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'REFRESH_SECRET' limit 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $sched$
);
