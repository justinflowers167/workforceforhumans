# WFH Founder Runbook

**Living document. Update when reality shifts.**
Last updated: 2026-04-27 (Phase 12 §A/§B/§C shipped — feed cron, feedback widget, AI-skills loop)

This is the systematic checklist for keeping Workforce for Humans healthy as a solo operator. If you're staring at the platform and wondering "what should I be doing," start here.

**How to use:** set calendar reminders for the daily / weekly / monthly cadences. Open this file when each one fires. Use the Dashboards Index (§9) as your bookmark sheet. Cross off one-time setup items in §1 as you finish them.

---

## 1. Soft-launch checklist (remaining gates between you and a public announcement)

Phase 9 closed all the *code-side* items. What remains is business + content work — none of these are coding tasks I can do for you.

- [ ] Lawyer review of `privacy.html` + `terms.html`; remove "v1 — under legal review" banners (Phase 9 §3 — was one of the original 6 contingencies)
- [ ] Mobile QA video on a real iPhone, save to `docs/mobile-qa-2026-MM-DD.mp4` (Phase 9 §4 — runbook §5 lists the 5 golden paths, see also `docs/mobile-qa-checklist.md`)
- [ ] 3 real testimonials OR 1 verified employer logo on `index.html` — populate `WFH_TESTIMONIALS` / `WFH_EMPLOYER_LOGOS` arrays (Phase 9 §2 — code scaffold already in place)
- [x] ~~Real founder headshot replacing silhouette in `about.html`~~ — Shipped 2026-04-26. `/assets/founder-justin.jpg` (256×256, 13 KB JPG q88, downscaled from a 1254×1254 / 2 MB PNG drop).
- [ ] (Bonus) Capture Lighthouse re-run on 5 indexable pages (target SEO + A11y ≥ 95) — see §5 quarterly. Spot-check before announcement.
- [ ] (1-click, founder-owned) Enable Supabase Auth leaked-password protection: https://supabase.com/dashboard/project/dbomfjqijyrkidptrrfi/auth/providers — last open advisor finding from the 2026-04-25 sweep. Phase 10 §C migrations closed the other two on the same day (RLS perf rewrite + newsletter UPDATE narrowing).

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
- **Anthropic budget alert / monthly spend crossing $20** → ranked levers (cheapest first). Items 1, 2, 4 shipped 2026-04-26 in Phase 10 §A; remaining items are standby:
  1. ✅ ~~**Add prompt caching** to `match-jobs` and `parse-resume`~~ — Shipped 2026-04-26. `cache_control: { type: "ephemeral" }` markers added to the system block on all three Anthropic call sites. Honest caveat: current system prompts are below Anthropic's 1024-token minimum cacheable prefix, so the markers are no-ops today; forward-compatible when prompts grow.
  2. ✅ ~~**Lower `PRE_FILTER_MAX`** in `refresh-jobs/index.ts` from 200 → 100~~ — Shipped 2026-04-26. Halves Claude calls per cron run from ~20 batches → ~10.
  3. **Lower `CLAUDE_BATCH`** from 10 → 5 — fewer tokens per Claude call but doubles the number of calls; small token-spend reduction at the cost of more Anthropic API rate-limit pressure. Marginal. **Standby.**
  4. ✅ ~~**Switch `refresh-jobs` filter model** from `claude-sonnet-4-6` → `claude-haiku-4-5`~~ — Shipped 2026-04-26. ~5× cheaper input + output. Filter is binary keep/reject; well within Haiku's range. Combined with item 2, expected cron Anthropic spend drops ~10× (~$3/mo → ~$0.30/mo).
  5. **Switch `parse-resume` first-pass to Haiku, escalate ambiguous to Sonnet** — Haiku for clean PDFs, Sonnet only when JSON parse fails. Bigger refactor; only if items 1–4 don't fit budget. **Standby.**
  6. **Temporarily unset `ANTHROPIC_API_KEY`** — `refresh-jobs` falls back to pass-through (free) with a quality drop. Last-resort kill switch. Match-jobs and parse-resume will start returning errors though, so this only buys time on the cron, not a sustainable cost reduction. **Standby.**
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

### 8.7 Feedback triage (Phase 12 §B — weekly ritual)

Founder reads the inbox via SQL — no admin UI in v1. Run this every Monday alongside §3 weekly checks. Claude Haiku 4.5 stamps `claude_priority` (p0/p1/p2/p3) at submission time when `ANTHROPIC_API_KEY` is set; sort by priority ascending so p0/p1 surface first.

```sql
select id, created_at, page_path, category, claude_priority, claude_summary, message
from public.feedback
where status = 'new'
order by claude_priority asc nulls last, created_at desc;
```

After acting on (or dismissing) a row:

```sql
update public.feedback
set status = 'triaged'  -- or 'actioned' / 'wont-fix' / 'duplicate'
where id = '<uuid>';
```

P0 (site broken / data loss / security concern) → drop everything, fix today. P1 (significant UX block, payment friction) → ticket this week. P2 (feature request, polish) → pile up for the next phase. P3 (praise, opinion) → acknowledge if it warrants a reply, then move on.

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
   (Substitute `REFRESH_SECRET`, `DIGEST_SECRET`, or `INTELLIGENCE_FEED_SECRET` for `PRUNE_SECRET` as needed.)

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

### 10.6 Targeted resume cleanup (delete by ids)

When you need to remove specific stale resume rows + their backing storage objects (e.g. abandoned `pending` uploads, test data, GDPR-style targeted erasure), invoke `prune-inactive-data` with the admin mode body. `storage.protect_delete()` blocks raw `delete from storage.objects` SQL, so this function is the sanctioned path.

```sql
select net.http_post(
  url := 'https://dbomfjqijyrkidptrrfi.supabase.co/functions/v1/prune-inactive-data',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-prune-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'PRUNE_SECRET' limit 1)
  ),
  body := jsonb_build_object(
    'mode', 'delete_resumes_by_ids',
    'resume_ids', jsonb_build_array('<uuid-1>', '<uuid-2>')
  ),
  timeout_milliseconds := 60000
) as request_id;
```

Then poll `net._http_response` for the row with that `id`. Expected response shape: `{ok:true, mode:"delete_resumes_by_ids", requested:N, found:M, resumes_deleted:K, storage_files_deleted:L, storage_files_skipped:S}`. The Sunday cron (default mode, empty body) is unaffected — same secret, different body.

### 10.7 Map training resources to AI skills (Phase 12 §C — hand-curation)

After Phase 12 §C migrations applied, the `training_skills` link table is empty and the "Recommended training to grow into this role" panel under each match card renders nothing until you map. ~30 min of curated SQL inserts maps existing `training_resources` to the seeded AI skills (see ROADMAP §C1 for the seed list).

Find candidates per skill:

```sql
-- Look at the training catalog and pick the rows that genuinely teach a given AI skill.
select id, title, provider, source_url, tags, category_slug
from public.training_resources
where tags && array['AI','prompt','llm','agent','rag','vector','embedding','fine-tune','ai-tooling']
   or title ilike any (array['%prompt%','%llm%','%agent%','%rag%','%vector%','%embedding%','%fine-tun%'])
order by recommend_count desc, title;
```

Map a training row to one or more AI skills:

```sql
insert into public.training_skills (training_id, skill_id)
values
  ('<training-uuid>', (select id from public.skills where slug = 'prompt-engineering')),
  ('<training-uuid>', (select id from public.skills where slug = 'agent-frameworks'))
on conflict do nothing;
```

A training resource can map to multiple skills — e.g. a "Build an LLM agent" course tags both `agent-frameworks` and `prompt-engineering`. The match-card panel dedups by training id and ranks by `recommend_count` desc.

To audit current coverage:

```sql
select s.name, s.slug, count(ts.training_id) as mapped_count
from public.skills s
left join public.training_skills ts on ts.skill_id = s.id
where s.is_ai_skill = true
group by s.id, s.name, s.slug
order by mapped_count asc, s.name;
```

Skills with `mapped_count = 0` won't drive any training recommendation — fill those first.

### 10.8 Diagnose magic-link not arriving

1. Supabase dashboard → Authentication → Logs → search the email.
2. Resend dashboard → Emails → search the recipient.
3. If Supabase shows the link sent but Resend has no row, the Resend integration in Supabase is broken — check Supabase Auth → Email Templates → Provider settings.
4. If both show sent, ask the user to check spam + the "Promotions" Gmail tab.

### 10.9 Rebind an account email (e.g. switchover to admin@workforceforhumans.com)

The `auth.users.email` column is the magic-link recipient. Most app-side identifiers (`job_seekers.auth_user_id`, `employers.auth_user_id`, kb-admin allowlist via JWT email claim) hang off either the auth user UUID or the email address itself — so changing an email address has effects in two places:

1. **Code/data-side** (covered by SQL — the 2026-04-27 admin-email switchover migration is the concrete example). Update any DB row that stores the email as a string, e.g. `employers.contact_email`, `kb_editor_emails.email`. The `auth_user_id` foreign key relationships do NOT need updating because they point to the UUID, not the email.
2. **Auth-side** (dashboard-driven, this section). Pick one path:
   - **Rename the existing auth user** (preserves the auth_user_id, magic-link history, RLS bindings). Supabase dashboard → Authentication → Users → click the row → "Edit email" → save. The UUID stays put; the next magic-link sign-in uses the new address.
   - **Delete the old auth user, create a new one** (clean slate, but loses the auth_user_id links). Only do this if you're OK re-linking every `job_seekers` / `employers` row that pointed at the old UUID. After deletion: sign in once at the new address to provision the new auth.users row, grab the new UUID from the dashboard, then `UPDATE` the dependent rows: `update public.employers set auth_user_id = '<new-uuid>' where id = '<employer-id>'`.
3. **Sanity-check the kb_editor_emails JWT path.** kb-admin.html and the RLS policy both compare `lower(auth.jwt() ->> 'email')` to `lower(email)` in the allowlist table. If you renamed an auth user (path 1) and the new email is in the allowlist, KB write access works on next sign-in. If you deleted + recreated (path 2), the new auth user only gets KB access if the new email is in `kb_editor_emails`.

For the 2026-04-27 admin-email switchover specifically, founder ran the SQL migration (kb_editor_emails replace + employers.contact_email update) and chose path 1 (rename) for both `justinflowers2@gmail.com` and `justinflowers@hotmail.com` → `admin@workforceforhumans.com` in the Supabase Auth dashboard. *Caveat:* if both old auth users get renamed to the same admin@ address, Supabase rejects the second rename (auth.users.email is unique) — delete one of the duplicate auth users first, then rename the other.

---

## 11. When to revise this runbook

Update when:
- A new edge function or cron is added (extend §6 trigger list + §8 SQL).
- Free-tier limits are hit (§7 cost watch + trigger plan).
- A new dashboard/vendor enters the stack (§9 index).
- A recurring incident teaches a new procedure (§10 appendix).
- A phase closes in ROADMAP.md (cross items in §1; bump the date).

---

## 12. Personal → business account migration (one-time, planned 2026-04-27 → through the week)

WorkforceForHumans is graduating from "fun project" to a real business entity. Every SaaS account currently registered to a personal email (`justinflowers2@gmail.com` or `justinflowers@hotmail.com`) and a personal credit card needs to be re-anchored to the LLC and `admin@workforceforhumans.com`.

**The structural separation is more than email.** Three things create the actual personal-liability shield: (a) the LLC entity itself, (b) a business bank account + card the LLC owns, (c) ownership records (admin email + billing entity) on every service. This section sequences all three.

**Universal rule:** for every service, *invite the new admin first → verify access → only then remove the old user*. The "no other admins" failure mode locks you out of Stripe and Cloudflare hard.

### Pre-flight (gating; do FIRST)

- [ ] LLC formed — state filing complete, EIN issued, operating agreement drafted.
- [ ] Business bank account opened (carries the EIN, not your SSN).
- [ ] Business credit/debit card in hand and added as default payment method on file in Google Workspace.
- [ ] LLC operating address confirmed (PO box, virtual address, or home — pick one and use it consistently).
- [ ] Google Workspace primary `admin@workforceforhumans.com` active. Optional aliases worth setting up now while it's free:
  - `billing@` — subscription receipts, financial alerts.
  - `ops@` — incident notifications, monitoring alerts (Stripe radar, Supabase usage alerts).
  - `support@` — user-facing replies. Future-proofs handing off support.
  - All three forward to `admin@` today; can be split out later when you bring on help.

### Day 1 — Structural anchors (~1 hr; blocks the rest)

These two changes change the topology everything else hangs off. Do them in order.

#### 12.1 GitHub Organization

1. github.com/organizations/new → create `workforceforhumans` org owned by `admin@workforceforhumans.com`. Free tier is fine.
2. github.com/justinflowers167/workforceforhumans/settings → bottom of page → "Transfer ownership" → into the new org.
   - Branch protection rules and existing PRs travel with the transfer.
   - Open PRs (e.g. `claude/admin-email-switchover`) keep their numbers and conversations intact.
3. Update local remotes on every worktree:
   ```bash
   git remote set-url origin https://github.com/workforceforhumans/workforceforhumans.git
   ```
4. Re-add anything that doesn't transfer cleanly:
   - Cloudflare Pages → repo binding (see 12.4 below).
   - Any GitHub Actions secrets (none today; if added later, redo at the org level so they're inherited).
5. **Verify:** push a no-op commit (or empty commit `git commit --allow-empty -m "verify org transfer"`) and confirm Cloudflare Pages deploys it.

#### 12.2 Google Workspace billing identity

1. admin.google.com → Billing → Payments → add business card; set as default.
2. Subscriber details → update to LLC legal name + LLC operating address.
3. Don't remove personal card yet; let one renewal cycle land on the business card cleanly first.

### Day 2 — High-risk services (~1 hr; revenue + live ops)

These have the biggest blast radius if the migration goes wrong. Stay disciplined: invite → verify → swap card → THEN consider removing old user (some you should leave for a week).

#### 12.3 Supabase (project `dbomfjqijyrkidptrrfi`)

1. Dashboard → Project Settings → Members → Invite `admin@workforceforhumans.com` as **Owner**.
2. Sign in as admin@. Verify: project list shows `dbomfjqijyrkidptrrfi`, table editor reads `jobs`, edge functions list shows all 10.
3. Settings → Billing → swap card to business card; update billing email + tax details (LLC legal name + EIN).
4. **Verify:** deploy a no-op edge function change from admin@'s session to confirm deploy permissions work.
5. After a week of cleanly-billed renewals, demote/remove the personal admin from Members.

#### 12.4 Stripe

1. Account → Team → Invite `admin@` as Administrator.
2. Sign in as admin@. Verify: live + test mode visible, recent payouts visible, customer list visible.
3. Account → Business settings → swap legal entity to the LLC. **This re-runs KYC** — Stripe will ask for EIN documentation, business address verification. Allow 1–3 business days; account stays operational during review.
4. Account → Billing & invoices → swap payment method (this is the card Stripe charges *you* for fees, not where customers pay) to business card.
5. **DO NOT remove the personal admin during KYC.** If KYC pauses the account mid-review with no other admin, recovery requires support tickets. Wait until the LLC is fully approved + the next payout lands cleanly.
6. **Verify:** in test mode, trigger a checkout from index.html → confirm `stripe-webhook` processes it (the webhook signing secret is project-scoped, doesn't change with admin changes).

#### 12.5 Cloudflare (Pages + Registrar + Web Analytics)

1. Dashboard → Members → Invite `admin@` as **Super Administrator**.
2. Sign in as admin@. Verify: Pages project visible, `workforceforhumans.com` domain visible, Web Analytics dashboard loads.
3. Pages project → Settings → Builds & deployments → re-bind to the new GitHub repo URL (`workforceforhumans/workforceforhumans` instead of `justinflowers167/workforceforhumans`). The org transfer in 12.1 broke the old binding.
4. Trigger a manual deploy to confirm the new bind works.
5. If `workforceforhumans.com` is registered through Cloudflare Registrar, transfer it to the new account: Domain → Members → Move (free, instant). If registered elsewhere (Namecheap, GoDaddy), do that registrar's email/billing change separately.
6. Account → Billing → swap card.
7. **Verify:** production site loads at workforceforhumans.com; web analytics shows live traffic.

### Day 3 — LLM + email services (~30 min)

Lower blast radius (a broken key just means a feature degrades until redeploy), but every key rotation here means an edge-function redeploy.

#### 12.6 Anthropic Console

1. Settings → Workspace → Members → Invite `admin@` as Admin.
2. Sign in as admin@; verify usage dashboard + can create API keys.
3. Generate a fresh API key under admin@'s identity (label it `wfh-prod-2026-04`).
4. Supabase → Edge Functions → Secrets → update `ANTHROPIC_API_KEY` to the new value.
5. Manually fire each Anthropic-using function (per §10.4 invocation pattern):
   - `match-jobs` (via member.html "Find new matches" button while signed in).
   - `parse-resume` (via resume.html upload while signed in).
   - `refresh-jobs` (via curl with `x-refresh-secret`).
6. Confirm all three return ok and the Anthropic console shows usage under admin@'s identity.
7. Settings → Billing → swap card.
8. **Only after all three verifications:** revoke the old API key, then remove the personal user.

#### 12.7 OpenAI Platform (used by `intelligence-feed` for embeddings)

1. Same pattern as Anthropic: invite admin@ → sign in → generate fresh key.
2. Supabase Secrets → update `OPENAI_API_KEY`.
3. Manually fire `intelligence-feed` (curl with `x-intelligence-feed-secret`).
4. Confirm a fresh row in `feed_items` has a populated `embedding` vector.
5. Settings → Billing → swap card.
6. Revoke old key, remove personal user.

#### 12.8 Resend

1. resend.com → Team → Invite admin@.
2. Domain settings → confirm `workforceforhumans.com` SPF/DKIM records still resolve correctly (they should be DNS-side, unaffected by Resend account ownership).
3. Generate new API key under admin@; update Supabase secret `RESEND_API_KEY`.
4. Redeploy `send-match-digest` and `stripe-webhook` (both use Resend).
5. Manually fire `send-match-digest` and confirm the test email shows in Resend's email log under admin@.
6. Settings → Billing → swap card.
7. Revoke old key, remove personal user.

### Day 4 — Analytics + low-risk (~15 min)

#### 12.9 PostHog (US Cloud)

1. Project → Settings → Members → Invite admin@ as Admin.
2. Settings → Project → Transfer ownership to admin@.
3. Billing → swap card.
4. The project token (`phc_uFTsr…`) is project-scoped and unchanged — no code update needed.

#### 12.10 USAJobs.gov developer

The USAJobs API doesn't have a member-invite model — you create a parallel account.

1. developer.usajobs.gov → register a new account at admin@workforceforhumans.com.
2. Get the new auth key.
3. Supabase Secrets:
   - Update `USAJOBS_AUTH_KEY` to new value.
   - Update `USAJOBS_USER_AGENT` to `admin@workforceforhumans.com` (the user-agent must be a contactable email registered with USAJobs).
4. Manually fire `refresh-jobs`; confirm the next cron run is green and `jobs_full` sees fresh `source='usajobs'` rows.
5. Old developer account can sit dormant — no billing.

#### 12.11 Domain registrar (if not Cloudflare)

If `workforceforhumans.com` is somewhere other than Cloudflare:
1. Update WHOIS contact email to admin@.
2. Update billing card.
3. Confirm auto-renew is on and DNS records (especially the SPF/DKIM/DMARC for Resend) are intact.

### Day 5 — Verification + cleanup (~30 min)

- [ ] Run §10.4 manual fire on every cron function: `refresh-jobs`, `send-match-digest`, `prune-inactive-data`, `intelligence-feed`. All return ok.
- [ ] Visit each service's billing page; confirm next renewal will charge the business card.
- [ ] Cancel any duplicate/dormant subscriptions surfaced during migration (Plausible if still active, old Anthropic/OpenAI orgs, etc.).
- [ ] Update §9 Dashboards index: add a column "owner of record" with admin@ on every row.
- [ ] Save a memory entry capturing the LLC formation date + the cutover-complete date.
- [ ] One month from now: run §7 cost watch and confirm every charge hits the business card. If not, find the orphan and fix it.

### Gotchas worth re-reading before each day

- **API keys created under personal user die when that user is removed.** Always: generate new key under new admin → verify → THEN revoke old.
- **Stripe entity change re-runs KYC.** Don't time it against a launch or a customer-facing demo; allow 1–3 business days.
- **Subscription billing pro-rations are weird mid-cycle.** Day 1 of a month is the cleanest cutover for billing-side changes.
- **Webhook signing secrets are project-scoped, not user-scoped.** Stripe webhook secret + Supabase service role key DO NOT rotate when account ownership changes; they only rotate if you manually rotate them.
- **Cloudflare Pages re-bind is the only thing that breaks deploys** during the GitHub org transfer. Trigger a manual deploy after each anchor change to catch this.
- **Magic-link sign-in to your own product** uses Supabase Auth, not these external services. Already handled in §10.9 — don't re-do that part here.
