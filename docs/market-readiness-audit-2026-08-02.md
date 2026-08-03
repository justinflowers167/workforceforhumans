# Market-readiness audit — 2026-08-02

Full sweep of repo, live Supabase, live site, and PostHog after ~9 weeks of no
commits (last merge to `master` was 2026-05-25). Question asked: *what actually
blocks pointing traffic at this site?*

**Headline:** the machinery is healthy — crons green, 2,757 active jobs, feed
fresh, migrations in sync. What's not ready is the **trust surface**: one live
security hole that lets anyone write into the public job feed, and a set of
claims on the homepage that the site's own data contradicts. Both are cheap to
fix and both are the kind of thing a first serious visitor finds.

---

## P0 — Fix before any traffic push

### 1. Anyone can inject jobs into the live feed

`public.upsert_usajobs(rows jsonb)` is `SECURITY DEFINER` and has `EXECUTE`
granted to `anon`. The anon key ships in every page's HTML (by design), so any
internet user can POST to `/rest/v1/rpc/upsert_usajobs` and insert rows into
`public.jobs` with attacker-controlled `title`, `description`, and `apply_url`
at `status='active'`, bypassing RLS entirely. Those rows render in `jobs_full`
on the homepage and `jobs.html`.

Verified live on 2026-08-02: an anon-key POST with `{"rows":[]}` returned
`HTTP 200` (empty array, so nothing was written — reachability proof only).

`jobs.html` does run `safeUrl()` on `apply_url`, which blocks `javascript:`
XSS. It does **not** block a well-formed `https://` link to a phishing site.
Against an audience of displaced workers actively hunting for work, that is the
whole attack — no XSS needed.

**Fix staged:** `supabase/migrations/20260802_revoke_public_rpc_execute.sql`.
Revokes `anon`/`authenticated` EXECUTE on `upsert_usajobs` plus five trigger
functions that were never meant to be reachable over PostgREST. `refresh-jobs`
calls the RPC with the service-role client, so the daily cron is unaffected.
Not yet applied to live.

### 2. The homepage traffic claim isn't supported by our own instrumentation

`index.html:360` reads: *"Read by 15,000+ this month."*

PostHog `$pageview` counts (capture is on — `capture_pageview: true` in
`assets/site.js`):

| Month | Pageviews | Unique people |
|---|---|---|
| 2026-07 | 45 | 45 |
| 2026-06 | 62 | 62 |
| 2026-05 | 125 | 92 |

That's ~300× off. The 45/month figure is also far more consistent with the rest
of the live data than 15,000 is: 1 job seeker (the founder's test account), 0
newsletter subscribers ever, 0 feedback submissions, 0 assessment submissions,
0 applications, 0 job alerts, 1 lead — across nine months.

**Resolved 2026-08-02: founder's read is that PostHog is correct.** The
Cloudflare figure most likely counted bots, with some ad-blocker skew in the
other direction (PostHog is on common blocklists; `cloudflareinsights.com` less
so). The exact number stays unresolved, but it doesn't need resolving for the
decision — "15,000+ readers" isn't defensible either way, and it was the single
trust line under the hero CTA: the one claim a visitor can't verify but a
journalist or investor absolutely will ask about.

**Copy fixed** — hero trust line now names what's true and checkable (who
builds it, what it costs) instead of borrowed scale.

**A caution for anyone re-running this analysis:** `jobs.view_count` and
`kb_articles.view_count` are both **0 across all 2,757 jobs and 18 articles**,
and that is *not* evidence of zero traffic. See #14 — the counters have never
worked. PostHog remains the only functioning measurement on the site.

### 2a. The strategic consequence — the bottleneck was misdiagnosed

Phase 15's whole sequence was built on "acquisition is the named bottleneck (0
new seekers in 14 days)" with the implied model of meaningful traffic that
wasn't converting. At ~45 pageviews/month that model is wrong. There is no
conversion problem to fix, because there is almost nobody arriving to convert.

That re-orders the remaining plan. Tester recruiting (§B) and funnel cleanup
(§C) are both premature against a funnel this empty — and the §A funnel
instrumentation, while correctly wired, will not produce a readable chart at
this volume for a long time. The binding constraint is distribution: nothing
currently brings a stranger to the site. Worth naming explicitly before more
build effort goes into surfaces nobody reaches.

---

## P1 — Credibility leaks every visitor sees

### 3. The "weekly market briefing" promise is broken twice over

`index.html:360` — *"New [market briefing](/feed.html) every week from Justin
Flowers"*. Also claimed on `index.html:395` and `learn.html:508`.

- Last file in `content/market-pulse/` is **2026-04-18** — 15 weeks ago.
- There is no renderer for those markdown files anyway, so the link points at
  `/feed.html`, which is the daily RSS aggregator — machine-pulled headlines,
  not a practitioner briefing.

So a visitor who clicks the practitioner-voice proof point lands on the most
aggregator-looking page on the site. This is the exact anti-pattern the Cluster
A voice work was built to avoid. Either restart the cadence and wire up a
renderer, or cut the claim.

### 4. Legal banners still say "under legal review"

`terms.html:62` and `privacy.html:65` both carry the *"v1 — under legal review"*
banner, open since April. Listed as a soft-launch gate in runbook §1.

### 5. `jobs.html` meta description is pre-repositioning copy

> "Browse thousands of jobs in healthcare, trades, tech, green energy,
> logistics, and more. Entry-level welcome. No degree required."

This is the search-result snippet for the site's highest-`changefreq` page. It
sells the old job-board framing (which Cluster B deliberately moved away from),
and "thousands of jobs" across six named verticals oversells a feed that is
2,747 federal roles from a single source. `learn.html`'s title is still "Level
Up" against a how-it-works flow that now reads Assess → Plan → Move.

---

## P1 — Acquisition plumbing that quietly costs traffic

### 6. The primary conversion page is de-indexed and un-shareable — FIXED

Cluster B made `/resume.html` the hero CTA target ("Start your adaptation
plan"). Nothing downstream was updated:

- **`resume.html:7` carried `<meta name="robots" content="noindex, nofollow">`**
  — a hard de-index directive, left over from when the page sat behind
  sign-in. This is stronger than robots.txt and applies to the clean URL too.
- `robots.txt` still `Disallow: /resume.html` (from when it was a member tool)
- absent from `sitemap.xml`
- no `rel="canonical"`, no `og:image` — so every share renders a bare link with
  no preview card

The single most important page in the funnel was explicitly telling Google not
to index it. All four fixed 2026-08-02. `member.html` / `employer.html` /
`kb-admin.html` / `success.html` / `cancel.html` keep their `noindex` — correct
for those.

### 7. robots.txt doesn't match the URLs the site actually serves

Cloudflare Pages serves clean URLs. All of these return `200`:
`/resume`, `/member`, `/employer`, `/kb-admin`, `/jobs`. `robots.txt` only
disallows the `.html` variants, so **none of the disallow rules apply to the
canonical URLs** — the admin surface included.

### 8. No `404.html` — every unknown URL returns 200 with the homepage

`https://workforceforhumans.com/nope-xyz.html` → `HTTP 200`, full homepage
markup, homepage `<title>`. That's a soft-404 across the entire URL space:
Google reads it as mass duplicate content, and typos or stale inbound links
silently serve the homepage instead of failing honestly. Cloudflare Pages
serves `404.html` with a real 404 status if the file exists.

### 9. `sitemap.xml` is stale and incomplete

All `lastmod` values are 2026-04-18 / 2026-05-10 despite the 2026-05-25 merges.
Missing `/resume`. Pathway pages point at `.html` URLs that redirect (308) to
clean URLs.

---

## P2 — Bugs and drift

### 10. The newsletter is a dead end — nothing ever reads the table

Two pages collect newsletter signups (`index.html` and `learn.html`), both
promising a recurring email. **No Edge Function, cron, or query anywhere reads
`newsletter_subscribers`.** `send-match-digest` — the only mailer — builds its
recipient list from `job_seekers` + `match_scores` and respects
`job_seekers.newsletter_opt_in`; it never touches this table.

So a subscriber row is written and then nothing happens to it, ever. The user
is told *"First digest coming soon."* That's an email address collected under a
stated purpose that isn't fulfilled — a promise problem before it's a
plumbing one.

Compounding it, both handlers reported success on failure: they did a bare
`await` on the upsert inside a `try/catch`, but supabase-js **resolves** with
`{error}` rather than throwing, so the `catch` could never fire.

**Fixed 2026-08-02:** both handlers now check `error` explicitly and show a real
failure message; the success copy no longer promises a digest on a schedule
that isn't kept. **Still open (founder decision):** wire a sender that reads
this table, or drop the forms. Tied to the same call as #3 — both hinge on
whether the weekly cadence restarts.

### 11. Repo says Fable 5; production runs the old model

`2e63052` ("Fable 5 on member-facing Claude surfaces") has sat unmerged on
`claude/fable-5-member-surfaces` since **2026-06-10**. Live `match-jobs` and
`parse-resume` were last deployed ~2026-05-09. So `CLAUDE.md` documents
`claude-fable-5` on the two moat surfaces while production still serves Sonnet.
Classic repo→live drift (runbook §8.9) — either merge and deploy, or revert the
doc.

### 12. The AI-skills → training loop renders nothing

`training_skills` has **0 rows**. Phase 12 §C shipped the schema, the picker,
and the member.html rendering, but the hand-curation step (runbook §10.7, ~30
min of SQL) was never done — so the training panel under every match card is
permanently empty. Shipped feature, invisible in production.

### 14. View counters have never worked — RLS silently rejects every increment

`jobs.view_count` is 0 across all 2,757 rows. `kb_articles.view_count` is 0
across all 18 published articles. Neither has ever been incremented.

The increment code exists — [kb.html:318](../kb.html) and
[jobs.html:653](../jobs.html) both fire a client-side
`update({ view_count: n + 1 })`. But the writes are rejected by RLS:

- `kb_articles` has exactly one UPDATE policy, `KB editors can update`, scoped
  to `authenticated` and gated on the `kb_editor_emails` allowlist.
- `jobs` has **no** UPDATE policy reachable by `anon` at all.

Both calls are fire-and-forget (no `await`, no error check), so the rejection
is completely silent. Two consequences:

1. Every KB article card renders **"0 views"** to any visitor who does arrive —
   an active anti-trust signal on the content surface.
2. There is no server-side traffic measurement on the site. PostHog is the only
   instrument, which is precisely why #2 had nothing to triangulate against.

**Recommended fix (not applied — needs a call):** a narrowly-scoped
`SECURITY DEFINER` RPC that does `update … set view_count = view_count + 1
where id = $1` and nothing else, granted to `anon` deliberately. That also fixes
the non-atomic read-then-write that `CLAUDE.md` already flags. Holding it
because it adds anon-callable surface in the same session that #1 closed some —
worth a deliberate yes rather than a silent one. If added, log it in runbook
§8.10 as a sanctioned exception so the next audit doesn't flag it as a repeat.

### 13. Still-open founder gates

- Social proof section hidden — `WFH_TESTIMONIALS` / `WFH_EMPLOYER_LOGOS` both
  empty (runbook §1)
- Supabase Auth leaked-password protection still disabled (one dashboard click,
  open since 2026-04-25)
- `WFH marketing plan.pdf` (10 MB) sits untracked in the repo root — commit it
  or `.gitignore` it

---

## Healthy — no action needed

- **Crons**: `refresh-jobs`, `intelligence-feed`, `send-match-digest`,
  `prune-inactive-data` all succeeded through 2026-08-02. No failures in 30 days.
- **Job feed**: 2,757 active (2,747 USAJobs + 10 employer), 203 added in the
  last 7 days, newest posted 2026-08-01.
- **Intelligence feed**: 187 items, newest 2026-08-01.
- **Migrations**: repo ↔ live fully in sync (runbook §8.8 clean).
- **Security posture otherwise sound**: CSP present, `safeUrl()` XSS-hardening
  on external apply URLs, RLS enforced everywhere the browser reads.

---

## What shipped 2026-08-02

- **P0 revoke applied to live.** `upsert_usajobs` now returns
  `401 permission denied` to the anon key; grants are service-role only.
  Migration checked in at
  `supabase/migrations/20260802_revoke_public_rpc_execute.sql`.
- **Fable 5 merged and deployed.** PR #57 squashed to `master` (`7c53f45`);
  `match-jobs` v16 and `parse-resume` v15 deployed. Repo and prod now agree.
- **SEO plumbing.** `resume.html` un-noindexed with canonical + og/twitter
  added; `404.html` created; `robots.txt` rewritten to cover the clean URLs
  the server actually serves; `sitemap.xml` refreshed with clean URLs, current
  `lastmod`, and `/resume`; canonical + `og:url` across all 12 content pages
  switched from `.html` to the extensionless form they redirect to.
- **Copy + bug.** `jobs.html` description re-voiced off the old job-board
  framing; both newsletter handlers now detect failures instead of always
  claiming success.

`learn.html`'s "Level Up" title was left alone on inspection — it matches its
own H1 and reads on-voice, so renaming it would be churn rather than a fix.

- **Traffic claims cut.** Founder confirmed PostHog is the accurate source, so
  "Read by 15,000+ this month" and the weekly-briefing promise came off
  `index.html` (hero trust line + how-it-works) and `learn.html` (free toolkit).
  The homepage newsletter block no longer promises a weekly cadence it has no
  sender for; it routes anyone wanting matched roles to the assessment, which
  genuinely does feed the Friday digest. The Friday digest claim stayed — that
  cron is real and green.

## Still open

1. **The newsletter dead end** (#10) — copy no longer over-promises, but
   nothing still reads `newsletter_subscribers`. Wire a sender or drop the
   forms.
2. **Restart the market briefing**, or retire the concept. `content/market-pulse/`
   has had no entry since 2026-04-18 and there's no renderer for it either.
3. **View counters** (#14) — decide on the increment RPC.
4. **Distribution** (#2a) — the real constraint. Phase 15 §B/§C assume a funnel
   with people in it; at ~45 pageviews/month that assumption doesn't hold.
5. **Legal banners** (#4) — blocked on counsel review.
6. **Curate `training_skills`** (#12) so a shipped feature stops rendering
   empty. ~30 min of SQL, runbook §10.7.
7. **Leaked-password protection** (#13) — one dashboard click.

Internal `href`s still point at `.html` paths and take a 308 hop on every
navigation. Harmless, and not worth a 16-file diff today, but worth folding
into the next pass that touches those files anyway.
