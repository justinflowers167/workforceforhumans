# Roadmap: 7 → 9

Target: move the site from a 7/10 to a 9/10 by **Thu May 28, 2026** (6 weeks from Apr 16).

Outcome-based: each phase ends when a testable truth holds, not when tasks are checked off. Sequenced so earlier work unlocks later work — don't do mobile before the nav is extracted, or the fix ships five times.

See `CLAUDE.md` for architectural context (HTML-per-page model, Edge Function patterns, data model conventions). This roadmap is the bridge from "what the site is" to "what it should be."

---

## Phase 1 — Foundation (Fri Apr 17 → Thu Apr 23)

**Outcome:** Changing the nav, footer, or a design token means editing **one** file, not ten.

- Extract shared design tokens into `/assets/site.css` (palette, fonts, spacing, breakpoints, shadows).
- Extract nav + footer markup into a small `/assets/site.js` that injects into `<body data-nav data-footer>`.
- Normalize breakpoints to one scale (proposal: `sm 640 / md 960 / lg 1200`).
- Update `CLAUDE.md`: "tokens + nav + footer live in `/assets/`. Do not duplicate."

**Done when:** I change `--amber` in one place and every page renders the new color with no diff to other files.

**Risk:** introducing a build step creep. Mitigation: `site.css` stays a plain file, `site.js` stays framework-free.

**Shipped (2026-04-17 → 18):** All 11 pages migrated to shared `/assets/site.css` + `/assets/site.js` (PR #7, #8). Tokens deduplicated (`grep -rn "^\s*--amber:" *.html` empty). CLAUDE.md conventions documented. Dead per-page `.nav-links{display:none}` rules removed (PR #10 cleanup).

**Slipped:** Nothing — outcome gate cleanly hit.

---

## Phase 2 — Mobile (Fri Apr 24 → Thu May 7, 2 weeks)

**Outcome:** A new user on a 375px iPhone can sign up → upload a resume → see matches with no layout break, no hidden nav, and every tap target ≥ 44px.

- Mobile nav: hamburger + slide-over drawer (in the shared nav from Phase 1).
- Product-page rework: `member.html`, `resume.html`, `jobs.html` — forms, filters, match list, resume review.
- Marketing polish: hero stack, AI banner padding, testimonials single-column.
- Touch-target audit (chips, badges, icon buttons).
- QA pass on iPhone SE (375px) and a 412px Android viewport — record a short screen-capture of the five golden paths.

**Done when:** every golden path completes on a 375px viewport without pinch-zooming or missing a nav target.

**Golden paths to test:**
1. Browse jobs with filters
2. Magic-link sign-in
3. Resume upload + review
4. View matches
5. Employer checkout start

**Shipped (PR #10):** Hamburger + slide-over drawer in `site.js`. Global 44px tap-target rule on `.apply-btn,.page-btn` in `site.css`. Breakpoints normalized to `sm 640 / md 960 / lg 1200`. Per-page mobile polish on index/jobs/resume/member.

**Slipped:** Modal close buttons missed the 44px sweep (jobs.html/employer.html/kb-admin.html were 30–32px until Phase 5 patched them with `@media(max-width:640px)` overrides). No regressions on golden paths.

---

## Phase 3 — Revenue integrity (Fri May 8 → Thu May 14)

**Outcome:** A successful Stripe checkout deterministically results in a listed job or an active employer subscription, with no manual steps.

- Add `supabase/functions/stripe-webhook` Edge Function.
- Handle `checkout.session.completed` (one-time): create/update `employers` row, credit one listing, email magic link to post.
- Handle `customer.subscription.created|updated|deleted`: adjust monthly listing entitlements.
- Idempotency via Stripe event ID stored in a `stripe_events` table.
- Gate `kb-admin.html` behind an auth check (not just RLS) — belt-and-suspenders.

**Done when:** a Stripe test-mode checkout runs end-to-end and writes the employer row + entitlement, with a replay of the same event producing no duplicate work.

**Why this phase, this late:** revenue risk is bounded while traffic is small. Doing it after mobile means the fix lands on a site that's ready to convert.

**Shipped (PR #11, #12):** `stripe-webhook` with idempotency via `stripe_webhook_events` audit table. `create-checkout` + `link-employer` Edge Functions in repo. `employer.html` dashboard (paid postings → jobs, subscription state, sign out). `kb-admin.html` gated by `kb_editor_emails` allowlist + RLS rewrite. All three Phase 3 migrations committed under `supabase/migrations/`. Three follow-up RLS column-write lints closed in security hardening pass.

**Slipped:** None on the outcome gate. Stripe customer portal deferred (Phase 4+); tax/refunds/proration deferred indefinitely as out-of-scope for 7→9.

---

## Phase 4 — Trust + discoverability (Fri May 15 → Thu May 21)

**Outcome:** The site is honest about its numbers and findable by the people who need it.

- Wire homepage stats (`s-jobs`, `s-entry`, `s-senior`, `s-emp`) to real `platform_stats` values, or remove them. No placeholders.
- Testimonials: source from 3 real early users, or mark as "representative examples."
- `sitemap.xml` + `robots.txt`.
- `JobPosting` structured data on job detail pages.
- `Article` structured data on KB articles.
- Open Graph + Twitter Card tags per page (single template in `site.js`).
- Accessibility pass: alt text, WCAG AA contrast check, visible focus states, skip-to-content link.

**Done when:** Lighthouse SEO ≥ 95 and Accessibility ≥ 95 on `index`, `jobs`, `learn`, and a KB article page. No placeholder numbers anywhere public.

**Shipped (PR #13):** OG/Twitter/canonical + Organization/WebSite JSON-LD on 5 indexable pages (index/jobs/learn/kb/feed). JobPosting JSON-LD on jobs.html with `?id=<uuid>` deep-link. Article JSON-LD on kb.html. `robots.txt`, `sitemap.xml`, `_headers` (CSP/Permissions-Policy), `/assets/og-default.svg`, `/assets/favicon.svg`. `noindex,nofollow` on 6 gated pages. `:focus-visible`, `.skip-link`, `<main>` landmarks, `sr-only` input labels added.

**Slipped (caught by Phase 5 Lighthouse run):**
- `--amber-txt: #c47d0e` was spec'd at ~4.9:1 but actually computes to 3.3:1 on white (fails AA for body text). Value corrected to `#8a5a00` (~5.9:1).
- Terra `#c85f3e` used as small-text color in several places hit 4.06:1 — below AA's 4.5:1. New `--terra-dk: #a84829` (~5.8:1) added; swapped in `.filter-card h2`, `.section-label`.
- Mobile hamburger drawer used `aria-hidden="true"` on focusable `<a>` children (Lighthouse `aria-hidden-focus` failure). Fixed by adding `inert` attribute toggled alongside `aria-hidden`.
- `<select>` elements on jobs.html (#sort-select) and feed.html (#filter-type, #filter-severity) had no accessible name. `aria-label` added.
- jobs.html filter sidebar used `<h3>` under `<h1>` with no intervening `<h2>` (Lighthouse `heading-order` failure). Retyped filter-card labels as `<h2>`.

Final empirical Lighthouse scores (2026-04-19, via Microsoft Edge headless):

| Page | SEO | A11y |
|---|---|---|
| index.html | 100 | 100 |
| jobs.html | 100 | 95 |
| learn.html | 100 | 96 |
| kb.html | 100 | 95 |
| feed.html | 100 | 95 |

All ≥ 95. Phase 4 outcome gate met after Phase 5 patch pass.

---

## Phase 5 — Buffer + re-rate (Fri May 22 → Thu May 28; executed 2026-04-19)

**Outcome:** The site scores ≥ 9 against the same rubric used on Apr 16, and we have a clear call on the next chapter.

- Fix what slipped.
- Re-rate against the 8-lens rubric (voice, design, product depth, AI, engineering hygiene, mobile, trust, accessibility/SEO). Publish the result back into this file.
- Decision: framework migration (Astro for marketing + islands for member) — yes / no / defer. Don't decide until the re-rate.

**Done when:** rubric shows ≥ 8 on every lens and ≥ 9 on voice, design, product depth, AI, and mobile.

**Shipped:** Modal tap-target override (`@media(max-width:640px){.modal-close{width:44px;height:44px}}`) on jobs/employer/kb-admin. Mobile drawer `inert` fix in `site.js`. `--amber-txt` value corrected, `--terra-dk` token added. `<select>` aria-labels on jobs + feed. jobs.html filter-card heading retype h3→h2. Empirical Lighthouse run on 5 pages confirming ≥ 95 gate.

**Result vs. "Done when":** ≥ 8 on every lens achieved **except Mobile (7) and Trust (7)**. ≥ 9 target hit on Voice (9) and A11y/SEO (9); missed on Design/Product/AI/Mobile (all at 8 or below). Honest read: site is solidly at **8 overall**, up a full point from 7, but short of the 9 target on the lenses that need product work (new features, a visual polish pass, real testimonials).

---

## Decision points built in

- **End of Phase 1:** if the extraction cracked something, stop and stabilize before starting mobile.
- **End of Phase 2:** if mobile took the full 2 weeks and feels shaky, take Phase 3 off the critical path and defer Stripe by one week.
- **End of Phase 4:** rerun the rubric. If you're already at 9, Phase 5 becomes "start the framework discussion" instead of polish.

## Out of scope for reaching 9

These would dilute focus. Keep them on a "Next" list.

- Framework migration (Astro / Next). That's the 9 → 10 conversation.
- New features (messaging, saved jobs, application tracking).
- Real-time anything.
- Mobile app.

---

## Tracking

- Update this file at the end of each phase with a short "what shipped / what slipped" note.
- Phase completion = merge to `master` with the outcome statement verified in the PR description.
- Re-rate at the end of Phase 5 and append the scorecard below.

### Scorecard history

| Date | Overall | Voice | Design | Product | AI | Eng hygiene | Mobile | Trust | A11y/SEO |
|---|---|---|---|---|---|---|---|---|---|
| 2026-04-16 | 7 | 9 | 8 | 8 | 8 | 6 | 4 | 6 | 5 |
| 2026-04-19 | 8 | 9 | 8 | 8 | 8 | 8 | 7 | 7 | 9 |

**Per-lens notes (2026-04-19):**

- **Voice (9, unchanged):** Empathetic service voice sustained by the 12-article KB content pack and weekly market-pulse briefs. The homepage rewrite for honest numbers didn't compromise tone.
- **Design (8, unchanged):** Tokens + focus rings + contrast bumps held. No visual redesign this cycle. 9 needs a deliberate polish pass on typography hierarchy and spacing consistency across member/employer surfaces.
- **Product depth (8, unchanged):** Employer dashboard landed in P3; KB content in P3 addendum. No new member-side features. 9 needs product work (saved jobs? application tracking? richer match feedback?) — out of buffer scope.
- **AI (8, unchanged):** `parse-resume` and `match-jobs` with Claude Sonnet 4.6 continue to work as shipped. `intelligence-feed` is RSS+aggregator, not adaptive. 9 needs a new AI surface (career-path coach on learn.html? match-quality explanations?).
- **Engineering hygiene (8, up from 6):** Migrations checked into repo. Stripe webhook idempotency audit table. RLS hardened and all three column-write advisor findings closed. Security headers in `_headers`. The one remaining gap is test coverage — there are no automated tests, only manual verification. Held back from 9 because of that.
- **Mobile (7, up from 4):** Hamburger + drawer, 44px tap rule, breakpoint normalization (P2), modal close button fix (P5). No explicit viewport QA artifact recorded (no 375px screencap). 9 needs that empirical record + a full-path test on a real device.
- **Trust (7, up from 6):** No placeholder numbers, no invented testimonials, honest empty states. Security headers (`_headers`) in place. 9 is blocked by real social proof — actual testimonials, verified employer logos, public roadmap transparency page. None of those are code problems.
- **A11y/SEO (9, up from 5):** Empirically confirmed via Lighthouse on 5 indexable pages — all ≥ 95 on both categories. OG/Twitter/canonical/JSON-LD everywhere. `noindex` on gated pages. Skip link, focus-visible, landmarks, sr-only labels, select aria-labels, correct heading order. The remaining ticket is per-job and per-article URL rewrites (hash-routed KB, modal-only job detail) — see out-of-scope below.

---

## Framework decision (2026-04-19)

**Answer: defer.** Revisit when a triggering signal appears.

**Reasoning:**

- **The static-HTML model is working.** 11 pages, shared chrome via `/assets/site.js`, zero build step. An Astro `<Layout>` slot would save ~15 lines of `<head>` duplication per page and add type safety on Supabase RPCs — real but marginal savings at this scale.
- **Edge functions stay on Deno regardless.** Astro wouldn't touch `supabase/functions/*`. The real engineering risk (Stripe webhook correctness, idempotency audit table, RLS policies) lives there and is untouched by a framework choice.
- **Roadmap's own categorization.** This file's "Out of scope for reaching 9" already names framework migration as *"the 9 → 10 conversation."* The re-rate confirms we're at **8 overall** — the 9→10 conversation is still the next one, not this one.
- **Known technical-debt pockets that migration would help:** per-page duplication of `<head>` OG/canonical/JSON-LD blocks; client-side `site.js` nav injection causing a brief unstyled flash on slow connections; no compile-time check on Supabase column names in RPC calls. None are load-bearing today, but they're where the first signs of strain will show.

**Revisit signal.** Reopen the framework question when any of:
1. Page count grows past ~20 (current: 11).
2. A second developer joins and onboarding friction becomes a real cost.
3. A Lighthouse CLS or TBT regression lands that's clearly attributable to client-side nav injection.
4. A new feature requires per-job or per-article real URLs (KB hash routing + job modals currently block this; the migration would naturally fix both).

## Out of scope for the next chapter (still)

- Per-job real URLs (replacing `jobs.html?id=<uuid>` with `jobs/<slug>.html` or dynamic server rendering). Requires either a build step or server rendering — blocked on the framework decision.
- Per-article KB URLs (replacing `kb.html#article/<slug>`). Same block.
- Dynamic `sitemap.xml` regeneration covering jobs and KB articles.
- Seeded `platform_stats` so the hero stat cards show real counts instead of being hidden on failure. Unblocked by content/business work, not code.
- Real testimonials, verified employer logos. Unblocked by real users/buyers.
- Automated test suite. The biggest lift to push Eng hygiene from 8 → 9.

---

## Launch Readiness Week — Mon 2026-04-20 → Sun 2026-04-26

**Outcome for the week:** WFH is publicly launchable by end of day Sun 2026-04-26 — no empty job board, a human face on the site, analytics running, legal pages in place, weekly digest live on a cron.

Framing comes from the CSO read on 2026-04-19 (post-Phase 7 ship): the site is ~85% technically ready and ~50% market-ready. The gap is content, pipes, and legal — not code. This week closes the gap.

Each day has a single outcome, a task list, a done-when gate, and a slip budget. Dependencies that need a human other than Justin are front-loaded to Monday AM so they have maximum runway.

### Mon 2026-04-20 — Jobs inventory, part 1 (foundation)

**Outcome:** USAJobs.gov source is researched, the `jobs` table can carry external-sourced rows, and the `refresh-jobs` Edge Function scaffold deploys cleanly.

**Tasks:**
1. Read USAJobs.gov API docs (https://developer.usajobs.gov/). Capture: auth model (User-Agent + Authorization-Key headers, both free), rate limits, search endpoint shape, filter parameters (remote-eligible, entry-level, keywords).
2. Design the data-model change. Recommended shape:
   - `jobs.source text not null default 'employer'` — values `'employer'` (paid verified) or `'usajobs'` (external).
   - `jobs.source_url text` — external apply URL.
   - `jobs.source_ref text unique` — external job ID, for idempotent upserts.
   - Keep `employer_id` required. Seed one synthetic `employers` row ("USAJobs — external") as part of the same migration so `jobs_full` and existing FKs continue to work without schema ripple.
3. Write migration `supabase/migrations/20260420_phase8_jobs_external_source.sql`. Idempotent (`add column if not exists`, `on conflict do nothing` for the synthetic row). Apply via Supabase MCP `apply_migration`.
4. Scaffold `supabase/functions/refresh-jobs/index.ts` following the existing pattern (CORS headers, `json()` helper, service-role client, `x-refresh-secret` header auth modeled on `send-match-digest`). Skeleton only: OPTIONS preflight, POST trigger, error envelope. No business logic yet.
5. Add `[functions.refresh-jobs] verify_jwt = false` to `supabase/config.toml` — it's server-to-server, not user-facing.
6. Update `CLAUDE.md` to document the new function + the `source` / `source_url` / `source_ref` columns.

**Dependencies:** none today — all research + code.

**Done when:** migration applied on live DB; synthetic external employer row exists; `refresh-jobs` deploys and returns `{ok:true}` on an empty POST with the right secret header; CLAUDE.md updated.

**Slip budget:** if USAJobs API docs reveal a blocker, fall back to Greenhouse/Lever public boards for 5 curated companies (Anthropic, Vercel, etc.). Same data model holds.

### Tue 2026-04-21 — Jobs inventory, part 2 (ship + schedule)

**Outcome:** 50+ current, WFH-relevant USAJobs.gov roles on `jobs.html` by 6pm, refreshing daily at 7am ET.

**Tasks:**
1. Implement the pull in `refresh-jobs`: fetch USAJobs.gov filtered for remote-eligible + entry-to-mid-level + keywords relevant to WFH audiences (career changer, skills-based hiring, workforce transition, veterans, upskilling).
2. Claude filter layer: for each candidate job, pass to Claude Sonnet 4.6 with prompt "is this a realistic fit for a WFH audience (displaced workers, career changers)? Return JSON `{keep:bool, reason:string}`". Cap at top 50 per run.
3. Upsert into `jobs` with `source='usajobs'`, `source_ref=<external-id>`, `source_url=<apply-url>`, `employer_id=<synthetic-external-employer-id>`. Idempotent by `source_ref`.
4. Schedule via pg_cron: `select cron.schedule('refresh-jobs-daily', '0 11 * * *', ...)` — 11 UTC = 7am ET. Use `pg_net.http_post` with the `x-refresh-secret` header. Store `REFRESH_SECRET` via `supabase secrets set`.
5. Update `jobs_full` view to expose `source`, `source_url`, `source_ref`.
6. Frontend: update `jobs.html` card template to render a clear "Sourced from USAJobs.gov — apply on their site ↗" tag on `source='usajobs'` rows. Verified paid-employer rows keep their existing premium treatment. Distinct visual rhythm so the two are not confused.

**Dependencies:** Mon outcome shipped.

**Done when:** one manual `refresh-jobs` run upserts 20–50 USAJobs rows; the next daily schedule is registered in `cron.job`; `jobs.html` renders the source tag on external rows and nothing on employer rows; the Apply CTA on sourced rows opens the external URL in a new tab.

**Slip budget:** if the Claude filter quality is poor on first pass, disable the filter and let all USAJobs results through with the source tag visible. Re-tune the filter in week 2.

### Wed 2026-04-22 — Founder presence + analytics

**Outcome:** Justin is a human on the site, and we know what's working.

**Tasks — About page:**
1. Create `about.html` (HTML-per-page, `data-nav="marketing"`, shared chrome via `/assets/site.js`).
2. Draft ~400 words covering: I&O role at Quantinuum, why WFH exists (practitioner view on displacement, not theorist), human-led + AI-built stance, founder promise ("every piece of content should leave you more capable and more hopeful").
3. Headshot (500×500 JPG, warm + professional). File at `/assets/founder.jpg`.
4. LinkedIn link in-page.
5. Footer link injected via `/assets/site.js`. Add a "Meet the founder →" CTA on the homepage hero (index.html).
6. Add to `sitemap.xml`. Ensure `robots.txt` allows indexing. `noindex` must NOT be on this page.

**Tasks — Plausible analytics:**
1. Sign up for Plausible (privacy-first, $9/mo), provision `workforceforhumans.com` domain.
2. Add the Plausible script tag to the `<head>` injection in `/assets/site.js` so it loads consistently on every page. Single source of truth.
3. Update `_headers` CSP: add `plausible.io` to `script-src` and `connect-src`.
4. Verify a test page view appears in the Plausible dashboard within 5 minutes.
5. Wire three custom events: `CTA click — employer checkout`, `Event — resume upload`, `Event — find matches`.

**Dependencies (flagged Monday AM):** founder headshot ready (blocker for page completion); Plausible account (5-minute signup but needs DNS access to verify domain).

**Done when:** about.html is indexable, linked from nav + footer; Plausible dashboard shows live traffic from all 11 pages; the three custom events fire correctly in the Plausible event log.

**Slip budget:** if the headshot isn't ready, ship about.html with a placeholder "photo coming soon" silhouette — don't block the page on the asset.

### Thu 2026-04-23 — Legal minimums

**Outcome:** Privacy Policy and Terms of Service pages are published, covering PII + Stripe + third-party processors. Launch-blocking if missing.

**Tasks:**
1. Pull a reputable template (Termly free tier, iubenda, or a lawyer-friend template). **Do not generate from scratch via LLM** — legal templates should be vetted.
2. Customize for WFH specifics:
   - PII collected: email, resume content (text + uploaded file), profile data, location.
   - Third-party processors: Anthropic (resume parsing + match scoring), OpenAI (intelligence-feed embeddings, optional), Resend (email), Stripe (payments), Supabase (auth + storage + DB), Plausible (analytics).
   - Data retention: resumes retained while account active; deletable on request.
   - User rights: access, deletion, export. Point of contact: `hello@workforceforhumans.com`.
3. Create `privacy.html` and `terms.html` (marketing layout, `data-nav="marketing"`).
4. Footer links in `/assets/site.js` — both pages linked from every page.
5. Add to `sitemap.xml`; allow indexing (these need to be public and findable).
6. Lawyer-friend review before merge. Capture review sign-off in the PR description.

**Dependencies (flagged Monday AM):** lawyer-friend availability — Monday message: "two legal pages for 30-min review Thursday afternoon, I'll send the draft Wed EOD."

**Done when:** both pages are live, linked from every page footer, indexable. Lawyer review note pasted into the PR description.

**Slip budget:** if the lawyer review slips to Friday, ship the pages with a "v1 — under legal review" footer marker and update when cleared. Do not delay public launch on a 1-day review gap.

### Fri 2026-04-24 — Retention engine + E2E QA

**Outcome:** `send-match-digest` runs weekly on its own cron; the full golden-path suite is regression-tested.

**Tasks:**
1. Verify Supabase secrets: `DIGEST_SECRET`, `RESEND_API_KEY`, `DIGEST_FROM`, `SITE_URL`. Set any missing via `supabase secrets set`.
2. Read `supabase/functions/send-match-digest/index.ts` for Phase 7 compatibility. Does the digest email template include the new `rationale` and `growth_note`? If not, update the HTML template to render them — this is the member's first AI-visible touchpoint in email.
3. Schedule via pg_cron: Friday 9am ET = 13 UTC. `select cron.schedule('send-match-digest-weekly', '0 13 * * 5', $$select net.http_post(...)$$)` using the `x-digest-secret` header.
4. E2E test: sign in as the member test account, ensure at least one match has `score >= 60` and `emailed_at IS NULL`. Manually invoke the digest via `curl -X POST ... -H "x-digest-secret: ..."`. Verify email arrives. Confirm the rendered match cards include rationale + growth_note.
5. Full golden-path regression on desktop + 375px mobile:
   1. Browse jobs with filters
   2. Magic-link sign-in
   3. Resume upload + review
   4. View matches (click disclosure, see rationale + growth_note)
   5. Employer checkout start
6. Log any regressions; fix same-day if Sev 1-2.

**Dependencies:** Phase 7 PR merged to master before the cron's first real send (so the digest email template updates ride along with match display).

**Done when:** pg_cron schedule registered; one real digest delivered to the test account with rationale + growth_note rendering; all 5 golden paths pass.

**Slip budget:** if the digest email template rework is bigger than expected, ship the cron with the existing template on Fri and iterate template polish in week 2. The cron being live matters more than template polish.

### Sat 2026-04-25 — Mobile QA artifact + buffer

**Outcome:** A 375px real-device screencap of the 5 golden paths exists, and any regressions it surfaces are patched.

**Tasks:**
1. On a real iPhone (SE-class or 375px equivalent), record screencaps walking each of the 5 golden paths with brief narration. ~3–5 min total.
2. File the recording at `docs/mobile-qa-2026-04-25.mp4` or as a Google Drive link in ROADMAP.md (if file size is prohibitive).
3. Patch any regressions found on-device that DevTools didn't catch. Likely candidates: touch targets on new About / Privacy / Terms pages; Plausible script CSP; sourced-job card tag wrapping at 375px; disclosure marker alignment.
4. Buffer for any Mon–Fri slippage.

**Dependencies (flagged Monday AM):** physical device owned — confirm access.

**Done when:** video artifact committed or linked from ROADMAP.md; any Sev 1-2 mobile regressions closed.

### Sun 2026-04-26 — Re-rate + launch-readiness call

**Outcome:** Rubric refreshed, PRs merged, explicit go/no-go call on public launch timing.

**Tasks:**
1. Re-score the 8-lens rubric. Projected vs. current:

   | Lens | Apr 19 | Apr 26 projected | Why |
   |---|---|---|---|
   | Voice | 9 | 9 | unchanged |
   | Design | 8 | 8 | polish pass deferred |
   | Product | 8 | 9 | Phase 7 + jobs inventory |
   | AI | 8 | 9 | Phase 7 shipped + Claude job filter |
   | Eng hygiene | 8 | 8 | automated tests deferred |
   | Mobile | 7 | 8 | real-device QA artifact |
   | Trust | 7 | 8 | founder page + legal pages (9 needs real testimonials) |
   | A11y/SEO | 9 | 9 | unchanged |

   Expected overall: **8.5 → round to 9.**
2. Append the new row to the scorecard history table.
3. Merge any remaining PRs to master.
4. Write the "what shipped / what slipped" note inline in ROADMAP.md.
5. **Go/no-go on public launch:** if 9/10 overall, set launch date for Thu 2026-04-30 (give 3 days of post-launch monitoring buffer before the following week). If 8/10 with a clear gating lens, name it and plan week 2 accordingly.

**Done when:** updated scorecard committed; explicit next-week decision captured in ROADMAP.md.

### Monday-AM dependency front-load

These cannot be pushed later in the week without cascading slip:

1. **Message lawyer-friend:** "Sending you two legal pages (Privacy + ToS) for a 30-min review Thursday afternoon. Draft by Wed EOD."
2. **Confirm headshot:** ready or schedule a Tue/Wed photo session.
3. **Plausible signup + DNS:** 5 minutes but needs domain access.
4. **Physical device for Sat mobile QA:** confirm access.
5. **Supabase CLI + project link:** verify `supabase link --project-ref dbomfjqijyrkidptrrfi` still works for the week's deploys.

### Explicitly NOT in this week (backlog, not forgotten)

- Real testimonials outreach (week 2+)
- Employer GTM pitch page + outbound plan (week 2–3)
- Automated test suite (month 2)
- Framework migration (9→10 conversation, not launch)
- Greenhouse/Lever boards as additional job sources (week 2, if USAJobs proves thin)
- Per-job real URLs + dynamic sitemap (blocked on framework decision)
- Seeded platform_stats with real hero counts (content/business, not code)
