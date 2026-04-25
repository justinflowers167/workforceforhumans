# WFH Founder Runbook

**Living document. Update when reality shifts.**
Last updated: 2026-04-25 (Phase 9 close)

This is the systematic checklist for keeping Workforce for Humans healthy as a solo operator. If you're staring at the platform and wondering "what should I be doing," start here.

**How to use:** set calendar reminders for the daily / weekly / monthly cadences. Open this file when each one fires. Use the Dashboards Index (§9) as your bookmark sheet. Cross off one-time setup items in §1 as you finish them.

---

## 1. Soft-launch checklist (remaining gates between you and a public announcement)

Phase 9 closed all the *code-side* items. What remains is business + content work — none of these are coding tasks I can do for you.

- [ ] Lawyer review of `privacy.html` + `terms.html`; remove "v1 — under legal review" banners (Phase 9 §3 — was one of the original 6 contingencies)
- [ ] Mobile QA video on a real iPhone, save to `docs/mobile-qa-2026-MM-DD.mp4` (Phase 9 §4 — runbook §5 lists the 5 golden paths, see also `docs/mobile-qa-checklist.md`)
- [ ] 3 real testimonials OR 1 verified employer logo on `index.html` — populate `WFH_TESTIMONIALS` / `WFH_EMPLOYER_LOGOS` arrays (Phase 9 §2 — code scaffold already in place)
- [ ] Real founder headshot replacing silhouette in `about.html` (drop file in `/assets/`, swap `<img>` src)
- [ ] (Bonus) Capture Lighthouse re-run on 5 indexable pages (target SEO + A11y ≥ 95) — see §5 quarterly. Spot-check before announcement.
- [ ] (Bonus, 1-click) Enable Supabase Auth leaked-password protection: https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/auth/providers — flagged by the 2026-04-25 advisor sweep.

When the first 4 are done, you're cleared for soft-launch announcement.

### Closed in Phase 9 (2026-04-25)

- ✅ `refresh-jobs v11` perf fix merged (PR #24) — Claude filter live, runs in 35s
- ✅ Cloudflare Web Analytics confirmed collecting (was added 22 days prior; CSP fixed in PR #25 unblocked the JS beacon)
- ✅ PostHog Cloud added; 3 custom events verified live (`CTA: employer-checkout-start`, `Event: resume-upload`, `Event: find-matches`)
- ✅ Anthropic monthly spend cap set
- ✅ `prune-inactive-data` deployed + cron scheduled (Sun 15 UTC)
- ✅ Operations runbook checked in
- ✅ 3 hotfixes shipped: `trg_resumes_flip_others` trigger (PR #26), parse-resume cold-start (PR #27), parse-resume direct-to-Claude PDF (PR #28)

---

## 2. Daily ritual (~5 min)

Set a calendar reminder for ~9am every weekday.

- [ ] **Anthropic spend** — https://console.anthropic.com/usage. Today's spend reasonable? If yesterday spiked, see §7 trigger.
- [ ] **CF Web Analytics pageviews** — last 24h pageview count, top 3 referrers, top 3 pages (§9 link).
- [ ] **PostHog live events** — at least one of each: `CTA: employer-checkout-start`, `Event: resume-upload`, `Event: find-matches` (or zero is OK if no traffic). Anomalous spike or zero-events-when-traffic-exists → §7 trigger.
- [ ] **hello@workforceforhumans.com inbox** — answer anything from a real human within 24h (this is the trust differentiator vs. LinkedIn/Indeed).

If everything looks normal, you're done. Total: 5 min.

---

## 3. Weekly ritual (~30 min, Monday morning)

Set a recurring calendar reminder for Monday 9am.

- [ ] **Friday digest health** — run the SQL in §8.1 to confirm `send-match-digest` fired Friday and how many seekers got an email. Compare to last week.
- [ ] **New signups** — §8.2 SQL, week-over-week deltas for `employers` and `job_seekers`.
- [ ] **Active jobs feed** — §8.3 SQL. If `usajobs` row count is dropping, the daily cron may be unhealthy — see §7 trigger.
- [ ] **Stripe pulse** — https://dashboard.stripe.com → Payments → last 7 days. Any failed payments? Any churned subscriptions?
- [ ] **Anthropic week-to-date spend** — pace check vs. monthly cap.
- [ ] **Content cadence** — did a market-pulse brief land in `content/market-pulse/` last Friday? (No file Mon AM = miss.) Any new KB article needed in response to a question that came in?
- [ ] **PR backlog** — `gh pr list` (or browser): any `claude/*` branches sitting unmerged > 3 days?

Total: 30 min including any follow-ups.

---

## 4. Monthly ritual (~60 min, first weekday of month)

- [ ] **Anthropic month total** — vs. budget. Adjust §7 budget cap if needed.
- [ ] **Supabase usage** — https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/settings/usage. DB size vs. 500 MB cap. Edge invocations vs. 500k/mo cap. Auth users vs. 50k MAU cap. (At current scale all green; revisit when these light up.)
- [ ] **PostHog event count** — vs. 1M/mo free-tier cap. Currently nowhere near; alert when crossing 100k.
- [ ] **Stripe MRR + churn** — https://dashboard.stripe.com/billing/subscriptions. New subs, churned subs, expansion (employer plan upgrades).
- [ ] **Cron run history** — §8.4 SQL. Confirm: ~30 daily fires of `refresh-jobs`, 4 Friday fires of `send-match-digest`, 4 Sunday fires of `prune-inactive-data`. Any failures.
- [ ] **Stuck Stripe webhooks** — §8.5 SQL. Any rows in `stripe_webhook_events` with `error_message` not null? See §10.2 to clear and retry.
- [ ] **Resend deliverability** — https://resend.com/emails. Bounce rate, complaint rate. >5% bounce = problem.
- [ ] **ROADMAP.md status** — append a row to the Scorecard History table if a phase closed; add a "shipped/slipped" note for the month.

Total: 60 min.

---

## 5. Quarterly ritual (~2 hr, first Monday of quarter)

- [ ] **Lighthouse re-run** — Microsoft Edge headless on `index.html`, `jobs.html`, `learn.html`, `kb.html`, `feed.html`, `about.html`. Target SEO + A11y ≥ 95 each. Note regressions in ROADMAP.md.
- [ ] **Security review** — eyeball `_headers` (CSP), RLS policies (`supabase/migrations/00000000_baseline_schema.sql` for the canonical state), Edge Function auth patterns. Any new tables added? RLS on them?
- [ ] **8-lens rubric re-rate** — Voice / Design / Product depth / AI / Eng hygiene / Mobile / Trust / A11y-SEO. Append row to ROADMAP.md scorecard.
- [ ] **Privacy / Terms freshness** — Effective dates >12 months old? Any new third-party processors added (analytics swaps count)? Refresh the processor table in `privacy.html` §4.
- [ ] **KB content audit** — `kb_articles` table: any articles >12 months old that say "current" or reference a specific year? Update or retire.
- [ ] **Phase 10+ backlog grooming** — what's still in scope? What's been overtaken by reality? Drop or promote.

---

## 6. Trigger-based actions (if X happens, do Y)

- **New employer paid via Stripe** → before manually verifying their job posting, sanity-check the company. Search the contact email's domain. If it's a free-mailer (gmail/hotmail) for a "company," that's a yellow flag — reply-and-confirm before allowing the listing live. Anti-fraud protects platform reputation.
- **Cron failure (digest, refresh-jobs, or prune)** → §8.6 SQL to inspect the latest `net._http_response` for that job. If status_code 5xx, check edge-function logs (Supabase dashboard → Edge Functions → [function] → Logs). If 401, the secret in Vault and Edge Function env got out of sync — see §10.1 rotate.
- **Stripe webhook 4xx/5xx** → §10.2 procedure to diagnose and retry.
- **Anthropic budget alert / monthly spend crossing $20** → ranked levers (cheapest first):
  1. **Add prompt caching** to `match-jobs` and `parse-resume` — the `SYSTEM_PROMPT` block is identical across calls and is the largest input chunk. Anthropic prompt caching cuts cached-input tokens to ~10% of standard rate. Single SDK config flag per call site. Highest ROI.
  2. **Lower `PRE_FILTER_MAX`** in `refresh-jobs/index.ts` from 200 → 100 — halves Claude calls per cron run, accepts thinner candidate pool. Cron cost drops ~50%.
  3. **Lower `CLAUDE_BATCH`** from 10 → 5 — fewer tokens per Claude call but doubles the number of calls; small token-spend reduction at the cost of more Anthropic API rate-limit pressure. Marginal.
  4. **Switch `refresh-jobs` filter model** from `claude-sonnet-4-6` → `claude-haiku-4-5` — Haiku is ~5× cheaper on input + output. Filter is a binary keep/reject decision; Haiku usually sufficient. Single constant change in `refresh-jobs/index.ts`. Significant savings.
  5. **Switch `parse-resume` first-pass to Haiku, escalate ambiguous to Sonnet** — Haiku for clean PDFs, Sonnet only when JSON parse fails. Bigger refactor; consider only if items 1–4 don't fit budget.
  6. **Temporarily unset `ANTHROPIC_API_KEY`** — `refresh-jobs` falls back to pass-through (free) with a quality drop. Last-resort kill switch. Match-jobs and parse-resume will start returning errors though, so this only buys time on the cron, not a sustainable cost reduction.
- **Resume parse failures spike** → check `parse-resume` edge-function logs. Common cause: PDF format change at source.
- **Magic link not arriving for a member** → check Supabase Auth logs (dashboard → Authentication → Logs) for the email; check Resend dashboard for delivery + bounce.
- **PostHog crosses 500k events/mo** → consider sampling or move to Cloudflare Workers Analytics Engine ($5/mo, 10M events).
- **Supabase DB crosses 400 MB** → run `prune-inactive-data` manually + check whether `intelligence-feed` embeddings are bloating things.

---

## 7. Cost watching (free-tier ceilings)

| Service | Free-tier limit | Current burn (approx) | When to act |
|---|---|---|---|
| Anthropic | Pay-as-you-go ($10 deposit, monthly cap set 2026-04-25) | ~$0.10/refresh-jobs run = ~$3/mo cron alone; ~$0.025/parse-resume PDF; ~$0.05–$0.10/match-jobs run | See §6 trigger for the 6-step cost-reduction lever ranking. Prompt caching is the biggest unrealized win. |
| Supabase DB | 500 MB | ~5 MB | Comfortable for months |
| Supabase egress | 5 GB/mo | trivial | Alert at 4 GB |
| Supabase edge invocations | 500k/mo | ~30 daily refresh + ~52/yr digest + ~52/yr prune + member traffic | Comfortable |
| Supabase auth MAU | 50k | <100 | Comfortable for years |
| Cloudflare Pages | Unlimited bandwidth, 500 builds/mo | Static deploys = trivial | Comfortable |
| Cloudflare Web Analytics | Free, no caps | n/a | Always free |
| PostHog Cloud | 1M events/mo | n/a yet | Alert at 500k/mo |
| Resend | 3k emails/mo, 100/day | ~10/wk digest | Comfortable until ~300 active subscribers |
| Stripe | % per transaction, no fixed | n/a | Always proportional |

---

## 8. Health-check SQL (copy-paste into Supabase SQL editor)

URL: https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/sql

### 8.1 Friday digest stats (run Monday)

```sql
select
  count(*) as digests_sent_last_friday,
  count(distinct job_seeker_id) as unique_seekers,
  min(emailed_at) as first_send,
  max(emailed_at) as last_send
from match_scores
where emailed_at >= (date_trunc('week', now()) - interval '3 days')
  and emailed_at < (date_trunc('week', now()) - interval '2 days');
```

### 8.2 Weekly signup deltas

```sql
select
  (select count(*) from job_seekers where created_at >= now() - interval '7 days') as new_seekers_7d,
  (select count(*) from job_seekers where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as new_seekers_prev_7d,
  (select count(*) from employers where created_at >= now() - interval '7 days') as new_employers_7d,
  (select count(*) from employers where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as new_employers_prev_7d;
```

### 8.3 Active jobs feed health

```sql
select
  count(*) filter (where source = 'usajobs') as usajobs_active,
  count(*) filter (where source = 'employer') as employer_active,
  max(created_at) filter (where source = 'usajobs') as last_usajobs_insert,
  max(created_at) filter (where source = 'employer') as last_employer_insert
from jobs
where status = 'active' or status is null;
```

### 8.4 Cron run history (last 30 days)

```sql
select
  jobname,
  status,
  count(*) as runs,
  max(end_time) as last_run
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
where end_time > now() - interval '30 days'
group by jobname, status
order by jobname, status;
```

### 8.5 Stuck Stripe webhooks

```sql
select stripe_event_id, event_type, error_message, created_at
from stripe_webhook_events
where error_message is not null
order by created_at desc
limit 20;
```

### 8.6 Latest cron HTTP responses

```sql
select id, status_code, content_type, created,
       left(content::text, 200) as body_preview
from net._http_response
order by created desc
limit 10;
```

---

## 9. Dashboards index (bookmark these)

| Tool | URL | What you check there |
|---|---|---|
| Supabase project | https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi | DB, Auth, Edge Functions, Logs |
| Supabase SQL editor | https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/sql | Health-check queries (§8) |
| Supabase usage | https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/settings/usage | Free-tier ceilings |
| Anthropic console | https://console.anthropic.com/usage | Spend + rate limits |
| Anthropic spend cap | https://console.anthropic.com/settings/limits | Set monthly cap |
| Cloudflare Pages | https://dash.cloudflare.com/?to=/:account/pages | Deployments |
| Cloudflare Web Analytics | https://dash.cloudflare.com/?to=/:account/web-analytics | Pageviews, referrers |
| PostHog | https://us.posthog.com | Live events, funnels (top of dashboard → WFH project) |
| Stripe dashboard | https://dashboard.stripe.com/dashboard | Payments, subscriptions, webhooks |
| Stripe webhooks | https://dashboard.stripe.com/webhooks | Re-deliver failed events |
| Resend | https://resend.com/emails | Email delivery, bounces |
| GitHub repo | https://github.com/justinflowers167/workforceforhumans | Code, PRs, issues |
| GitHub PRs | https://github.com/justinflowers167/workforceforhumans/pulls | Open work |
| USAJobs API | https://developer.usajobs.gov/ | Source for daily job pull |
| Plausible (deprecated) | — | Replaced by CF + PostHog |

---

## 10. How-to appendix

### 10.1 Rotate a server-to-server secret (REFRESH / DIGEST / PRUNE)

When the Vault value and Edge Function env value drift apart, the cron 401s silently. Re-sync them.

1. Generate + insert new value in Vault (run in Supabase SQL editor):
   ```sql
   with new_value as (select encode(gen_random_bytes(32), 'hex') as v),
        deleted as (delete from vault.secrets where name = 'PRUNE_SECRET' returning 1),
        inserted as (
          select vault.create_secret(nv.v, 'PRUNE_SECRET') from new_value nv
        )
   select v as new_secret_value from new_value;
   ```
   (Substitute `REFRESH_SECRET` or `DIGEST_SECRET` for `PRUNE_SECRET` as needed.)

2. Copy the returned `new_secret_value`.

3. Open Supabase dashboard → Edge Functions → Manage secrets → click the existing secret → Update with the new value. Save.

4. Manually fire the function to verify (use the §8.6 net.http_post pattern, or refer to the verification commands shown earlier).

### 10.2 Retry a stuck Stripe webhook

1. §8.5 SQL to find the row with `error_message`.
2. Diagnose the cause from `error_message` text. Fix the underlying issue (most often: a column constraint, an order of operations, an env-var miss).
3. Clear the audit row so Stripe's re-delivery can succeed:
   ```sql
   delete from stripe_webhook_events where stripe_event_id = '<id from step 1>';
   ```
4. In Stripe dashboard → Webhooks → click the event → Resend.

### 10.3 Add a new KB editor

1. SQL editor:
   ```sql
   insert into kb_editor_emails (email) values ('person@example.com');
   ```
2. Tell them to sign in via magic link at `/kb-admin.html`.

### 10.4 Manually fire a cron job (for testing)

Use the same `net.http_post` pattern that the cron itself uses — secret stays in Vault. SQL editor:

```sql
select net.http_post(
  url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/<function-slug>',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-<header-name>', (select decrypted_secret from vault.decrypted_secrets where name = '<SECRET_NAME>' limit 1)
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 120000
) as request_id;
```

Then poll `net._http_response` for the row with that `id`.

### 10.5 Add a market-pulse brief

Drop a new file in `content/market-pulse/YYYY-MM-DD.md` (Friday's date). No deploy step beyond the normal git push — Cloudflare Pages picks it up automatically. (Note: site does not currently render these; they accrete as content for a future renderer.)

### 10.6 Diagnose magic-link not arriving

1. Supabase dashboard → Authentication → Logs → search the email.
2. Resend dashboard → Emails → search the recipient.
3. If Supabase shows the link sent but Resend has no row, the Resend integration in Supabase is broken — check Supabase Auth → Email Templates → Provider settings.
4. If both show sent, ask the user to check spam + the "Promotions" Gmail tab.

---

## 11. When to revise this runbook

Update when:
- A new edge function or cron is added (extend §6 trigger list + §8 SQL).
- Free-tier limits are hit (§7 cost watch + trigger plan).
- A new dashboard/vendor enters the stack (§9 index).
- A recurring incident teaches a new procedure (§10 appendix).
- A phase closes in ROADMAP.md (cross items in §1; bump the date).
