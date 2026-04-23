-- Phase 8 — Launch Readiness, Fri 2026-04-24.
-- Schedules the weekly send-match-digest cron. The function already exists
-- (deployed in Phase 3, updated to v8 today with Phase 7 growth_note in the
-- email template). This migration adds the recurring schedule — Fri 9am ET =
-- 13 UTC — reading DIGEST_SECRET from Supabase Vault.
--
-- Note: DIGEST_SECRET must be seeded in vault out-of-band via execute_sql
-- (same pattern as REFRESH_SECRET) AND the matching value must be set as
-- the DIGEST_SECRET Edge Function secret in the Supabase dashboard. Until
-- both exist and match, cron calls will 401 silently — no harm done, just
-- no emails sent.
--
-- Idempotent: unschedule any prior job with this name first.

do $unschedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'send-match-digest-weekly';
exception when others then null;
end $unschedule$;

select cron.schedule(
  'send-match-digest-weekly',
  '0 13 * * 5',  -- 13 UTC every Friday = 9am EDT / 8am EST
  $sched$
  select net.http_post(
    url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/send-match-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-digest-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'DIGEST_SECRET' limit 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $sched$
);
