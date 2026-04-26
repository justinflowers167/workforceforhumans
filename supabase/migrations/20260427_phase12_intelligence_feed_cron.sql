-- Phase 12 — Feature depth, 2026-04-27.
-- Schedules the daily intelligence-feed cron. Until this migration applied,
-- the function existed but had no scheduler, so the public feed was 15
-- days stale (founder spotted this on /feed.html during the 2026-04-26
-- review). The Edge Function reads INTELLIGENCE_FEED_SECRET from its own
-- env; this migration reads the matching value from Supabase Vault at
-- run time so the literal secret never lives in git.
--
-- Schedule: 12 UTC daily (= 8am EDT / 7am EST). Runs after the daily
-- refresh-jobs cron (11 UTC) so the platform's morning data wave hits
-- in order: jobs first, then news/training feed.
--
-- Secret seeding happens out-of-band (same pattern as REFRESH_SECRET +
-- DIGEST_SECRET + PRUNE_SECRET): insert the value into vault.secrets AND
-- set the matching Edge Function secret in the Supabase dashboard. Until
-- both exist and match, cron calls 401 silently — no destructive state
-- change, just stale data.
--
-- Idempotent: unschedule any prior job with this name first.

do $unschedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'intelligence-feed-daily';
exception when others then null;
end $unschedule$;

select cron.schedule(
  'intelligence-feed-daily',
  '0 12 * * *',  -- 12 UTC daily = 8am EDT / 7am EST
  $sched$
  select net.http_post(
    url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/intelligence-feed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-intelligence-feed-secret', coalesce(
        (select decrypted_secret from vault.decrypted_secrets where name = 'INTELLIGENCE_FEED_SECRET' limit 1),
        ''
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) as request_id;
  $sched$
);
