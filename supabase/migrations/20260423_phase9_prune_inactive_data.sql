-- Phase 9 — Soft Launch, Thu 2026-04-23.
-- Schedules the weekly prune-inactive-data cron. The Edge Function reads
-- PRUNE_SECRET from its own env; this migration reads the matching value
-- from Supabase Vault at run time so the literal secret never lives in git.
--
-- Schedule: 15 UTC every Sunday (= 11am EDT / 10am EST). Runs after the
-- weekly digest cron (Fri 13 UTC) so freshly emailed matches don't get
-- swept the same day they went out.
--
-- Secret seeding happens out-of-band (same pattern as REFRESH_SECRET +
-- DIGEST_SECRET): insert the value into vault.secrets AND set the matching
-- Edge Function secret in the Supabase dashboard. Until both exist and
-- match, cron calls 401 silently — no destructive state change.
--
-- Idempotent: unschedule any prior job with this name first.

do $unschedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'prune-inactive-data-weekly';
exception when others then null;
end $unschedule$;

select cron.schedule(
  'prune-inactive-data-weekly',
  '0 15 * * 0',  -- 15 UTC every Sunday = 11am EDT / 10am EST
  $sched$
  select net.http_post(
    url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/prune-inactive-data',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-prune-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'PRUNE_SECRET' limit 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $sched$
);
