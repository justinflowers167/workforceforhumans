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

## Phase 6 — Security + quality cleanup (executed 2026-04-19 → 20)

**Outcome:** Every Phase 4-surface-area finding the advisor flagged is closed, and the codebase is the authoritative source of schema.

- Feed XSS surface closed via `esc()` + `safeUrl()` helpers on `feed.html` (RSS text is untrusted — the reminder matters when aggregated content enters the render path elsewhere).
- `create-checkout` input validation tightened: plan whitelist, email regex, `site_url` checked against `ALLOWED_ORIGINS` to close the open-redirect vector.
- CSP added in `_headers` locking `connect-src` to Supabase + Stripe, `script-src` to self + cdn.jsdelivr + js.stripe, `frame-src` to js.stripe.
- Error hygiene: no more `err.message` leaks from client-facing functions. Everything goes `console.error` server-side; generic "please try again" to the client.
- `.modal-close` CSS consolidated into `/assets/site.css` at 36×36 desktop / 44×44 mobile. Duplicate styles deleted from `jobs.html`, `employer.html`, `kb-admin.html`.
- `member.html` inline `alert()` replaced with `.status.error`; `kb-admin.html` confirm() replaced with promise-based in-page modal.
- Brand text unified: "WorkforceForHumans" → "Workforce for Humans" across `<title>`, og:title, twitter:title on `index.html` + `learn.html` (7 spots).

**Schema backfill (the big one):** `supabase/migrations/00000000_baseline_schema.sql` captures the full public schema (24 tables, 5 views, RLS + policies) from the live project as of 2026-04-19 via MCP introspection. Fully idempotent. Repo is now authoritative — fresh deploys are possible.

**Shipped (PR #15).** **Slipped:** nothing on the outcome gate.

---

## Phase 7 — AI visibility on matches (executed 2026-04-19 → 20)

**Outcome:** When a member sees matches, Claude's reasoning is visible — the site stops hiding its most intelligent surface.

- Added `match_scores.growth_note text null` (migration `20260419_phase7_match_growth_note.sql`).
- `match-jobs` prompt rewritten: voice anchor block quoting three canonical WFH samples; 2–3 sentence second-person `rationale`; 1–2 sentence verb-led `growth_note` framing gaps as next edges (never deficits). `max_tokens` 4000 → 6000.
- `member.html` match card: native `<details>` / `<summary>` progressive disclosure. Summary copy: *"Claude's read on this match"* — names the AI while keeping the tap member-driven. `Next edge:` label in terra. Graceful degradation on null fields.

**Done-when verified:** a real member account's matches now return prose that feels like a coach's read, rendered in a collapsed-by-default card that opens with one tap.

**Shipped (PR #16).** **Slipped:** nothing.

---

## Phase 8 — Launch Readiness Week (Mon 2026-04-20 → Sun 2026-04-26)

**Outcome for the week:** WFH goes from ~50% market-ready to launchable. The gap was content, pipes, and legal — not code. Closed in seven focused days.

Framing came from the CSO read on 2026-04-19 (post-Phase 7): technically solid, commercially bare. Three code-shaped gaps (empty job board, no founder presence, no analytics) plus the legal minimum block. This phase closed all of them.

### Mon 2026-04-20 — Jobs foundation

Shipped (PR #17): `supabase/migrations/20260420_phase8_jobs_external_source.sql` — adds `jobs.source` / `source_url` / `source_ref`, partial unique index `jobs_source_ref_key` on `(source, source_ref) where source_ref is not null`, seeds synthetic `USAJobs.gov` employer row at fixed UUID `00000000-0000-0000-0000-00000000a001`. `refresh-jobs` Edge Function scaffold deployed (200-OK with auth + env guards wired, TODO comments for Tuesday's real logic). `supabase/config.toml` + `CLAUDE.md` updated.

### Tue 2026-04-21 — Jobs pull + daily cron

Shipped (PR #19): `supabase/migrations/20260421_phase8_refresh_jobs_pipeline.sql` enables `pg_net` + `pg_cron`; recompiles `jobs_full` to expose the new columns; adds the `upsert_usajobs(jsonb)` security-definer RPC (service-role only execute grant) to resolve the partial-index conflict supabase-js can't target directly; schedules `cron.refresh-jobs-daily` at 11 UTC (7am EDT) reading `REFRESH_SECRET` from Supabase Vault. `refresh-jobs` full logic deployed: 4 keyword buckets × 50 results, dedup, Claude Sonnet 4.6 relevance filter in batches of 10 with permissive fallback, top-50 by posted_at, bulk upsert via RPC. `jobs.html` source chip (federal navy) on card + modal.

### Wed 2026-04-22 — Founder presence + analytics

Shipped (PR #19): `about.html` with 360-word founder note in site voice, silhouette placeholder, LinkedIn + hello@ contact row, AboutPage+Person JSON-LD. Plausible script injected in `/assets/site.js` with safe `window.plausible()` shim queuing pre-load events. CSP in `_headers` extended for `plausible.io`. Three custom events wired: `CTA: employer-checkout-start`, `Event: resume-upload`, `Event: find-matches`. Hero CTA on `index.html`. Footer + sitemap updated.

### Thu 2026-04-23 — Legal minimums

Shipped (PR #19): `privacy.html` (12 sections — real third-party processor table, data collected, retention, AI-output disclaimer, state-specific rights) + `terms.html` (15 sections — eligibility, permitted use, member/employer disclaimers, external-sourced apply flow, AI disclaimers, liability, Colorado governing law). Both under visible amber "v1 — under legal review" banner per the plan's slip budget. Footer legal links swapped from mailto placeholders to real pages. sitemap.xml updated.

### Fri 2026-04-24 — Retention engine + QA

Shipped (this PR): `send-match-digest` v8 — email template now renders Phase 7 `rationale` + `growth_note` in the same "Claude's read" shape as member.html (terra `Next edge:` label). `match_scores` SELECT extended to pull `growth_note`. Apply CTA path corrected to `/jobs.html?id=<uuid>` (was hash-fragment). Migration `20260424_phase8_digest_cron.sql` schedules `cron.send-match-digest-weekly` at 13 UTC (9am EDT) every Friday; reads `DIGEST_SECRET` from Vault, matching the `refresh-jobs-daily` pattern. Fresh `DIGEST_SECRET` value seeded in Vault out-of-band via `execute_sql` so the literal stays out of git.

### Sat 2026-04-25 — Mobile QA artifact

Shipped (this PR): `docs/mobile-qa-checklist.md` — 5-golden-path test matrix (browse + filters, magic-link sign-in, resume upload, view matches w/ Phase 7 disclosure, employer checkout) plus cross-cutting checks (hamburger/drawer, founder page, privacy/terms TOC, Plausible console, CSP). Slip budget: fall back to DevTools 375×667 if real-device access isn't available; tag the artifact as a Phase 9 carryover item and do NOT launch public without at least a DevTools pass.

**Slipped:** real-device recording not captured (physical device required; user-owned). Migrated to Phase 9 as carryover.

### Sun 2026-04-26 — Re-rate + go/no-go

Re-scored against the 8-lens rubric; see the new row in the scorecard history below. Decision captured: soft-launch rather than cold public launch (per the business-leader review in-session), contingent on three user actions before going live (Plausible DNS verified, real headshot, 3 warm-contact testimonials OR 1 verified employer logo on the homepage).

### Across-the-week shipping summary

- **4 migrations** applied live: `20260419_phase7_match_growth_note`, `20260420_phase8_jobs_external_source`, `20260421_phase8_refresh_jobs_pipeline`, `20260422_phase8_qa_hotfix`, `20260424_phase8_digest_cron`.
- **8 Edge Function deploys** across Phase 7 + 8: `match-jobs` v5, `refresh-jobs` v7 (scaffold → full → hotfix → ANTHROPIC-optional), `send-match-digest` v8.
- **3 new pages**: `about.html`, `privacy.html`, `terms.html`.
- **2 pg_cron jobs** active: `refresh-jobs-daily` (11 UTC), `send-match-digest-weekly` (13 UTC Fri).
- **PRs merged**: #15, #16, #17, #19, #20 (plus this week-close PR).

---

## Tracking

- Update this file at the end of each phase with a short "what shipped / what slipped" note.
- Phase completion = merge to `master` with the outcome statement verified in the PR description.
- Re-rate against the 8-lens rubric at the end of each phase and append a row below.

### Scorecard history

| Date | Overall | Voice | Design | Product | AI | Eng hygiene | Mobile | Trust | A11y/SEO |
|---|---|---|---|---|---|---|---|---|---|
| 2026-04-16 | 7 | 9 | 8 | 8 | 8 | 6 | 4 | 6 | 5 |
| 2026-04-19 | 8 | 9 | 8 | 8 | 8 | 8 | 7 | 7 | 9 |
| 2026-04-23 | 8 | 9 | 8 | 9 | 9 | 8 | 7 | 8 | 9 |

**Per-lens notes (2026-04-23, end of Launch Readiness Week):**

- **Voice (9, unchanged):** `about.html` founder note + Privacy/Terms pages kept the practitioner-not-marketer register. "The ground shifted. Nothing is wrong with you." holds the line. Legal pages don't contradict it.
- **Design (8, unchanged):** No visual redesign this cycle. About page is clean, source-chip on jobs.html fits the existing rhythm. 9 still needs a typography/spacing pass across member/employer surfaces — deliberately deferred.
- **Product depth (9, up from 8):** Phase 7 match explanations + Phase 8 daily USAJobs pipeline + weekly digest cron with Phase 7 email shape. Members + employers both have a new surface to interact with.
- **AI (9, up from 8):** Match explanations visible on member.html. `refresh-jobs` Claude relevance filter infra is live and staged (fires as soon as `ANTHROPIC_API_KEY` is added; runs in pass-through mode today). Visible + gated is better than invisible.
- **Engineering hygiene (8, unchanged):** Phase 6 security work + Phase 8 QA hotfix closed all review findings (XSS, slug collision, rel=noopener, posted_at clamp, retention wording). Magic-constant documentation comments. Still no automated test suite — that's the 8→9 unlock and it didn't happen this cycle.
- **Mobile (7, unchanged):** `docs/mobile-qa-checklist.md` authored but no real-device artifact captured. DevTools 375 does pass; real-device recording is Phase 9's first item.
- **Trust (8, up from 7):** `about.html` puts a human on the site; `privacy.html` + `terms.html` remove the compliance block. 9 is still gated on real testimonials + verified employer logos — business/GTM work, not code.
- **A11y/SEO (9, unchanged):** OG/Twitter/canonical/JSON-LD on About + Privacy + Terms matching the Phase 4 template. robots/sitemap updated. No Lighthouse regressions expected (spot-check in Phase 9 mobile QA).

**Overall read (2026-04-23):** **8**, with 4 lenses at 9 (Voice, Product, AI, A11y/SEO) and the remaining 3 at 8 (Design, Eng hygiene, Trust) plus Mobile at 7. The site is launchable — not yet "world-class" in the rubric sense. The gap from 8 → 9 is a specific short list: real social proof, automated tests, mobile artifact, typography polish. Phase 9 closes the first three of those.

---

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

## Phase 9 — Soft launch + trust (planned 2026-04-27 → 2026-05-03)

**Outcome:** The site is ready for a *public* announcement — not just reachable-at-a-URL, but defensible on trust, compliance, and filter quality. The soft-launch list from the business-leader read becomes a checklist of 5 items, each with a named owner.

Sequencing principle: stay revenue-aware. Every item on this phase either (a) unblocks public launch or (b) feeds the employer-conversion flywheel the CSO flagged as the 10× stress point. Anything that doesn't trace back to one of those two moves to Phase 10.

### 1. Turn on the Claude filter (user-owned, ~5 min)

- **Outcome:** `refresh-jobs` runs with `filter: "claude"` mode; the daily USAJobs pull drops from 7 unfiltered physician-heavy rows to ~20 WFH-audience-relevant ones.
- **Action:** paste `ANTHROPIC_API_KEY` into Supabase Edge Function secrets dashboard. No code change — PR #20 already wired the optional-key path.
- **Done when:** manual `curl` against `refresh-jobs` returns `{filter:"claude", degraded:false}` and DB shows a mix of non-MD federal roles (medical records, logistics specialists, program analysts, etc.).
- **Follow-up (30 min):** review 1–2 days of output with the founder eye — is the filter too strict? Too generous? Tune the prompt if needed.

### 2. Real social proof (business-owned, multi-day)

- **Outcome:** 3 real testimonials OR 1 verified employer logo visible on `index.html` homepage + `/about.html`. Trust moves from 8 → 9.
- **Action:** founder personally messages 15–25 warm contacts (laid-off PMs, career-changers, recruiters he trusts). Asks them to kick the tires + give one honest line. Separately: reach out to 2–3 target employers (ideally small, human-first companies) about being a launch partner with a logo on the site.
- **Code work:** small — add a testimonials strip + verified-logo wall to `index.html`, source from a new `testimonials` JSON file or hardcoded block. Defer row modeling in Supabase until >5 testimonials land.
- **Done when:** 3 quotes + attributed names live on homepage OR 1 verified employer logo + one-sentence case-study live.

**Shipped (2026-04-23, code scaffold only):** new `<section id="social-proof">` on `index.html` between the employer pitch and newsletter sections. `hidden` by default; renderer reads two inline arrays — `WFH_TESTIMONIALS` and `WFH_EMPLOYER_LOGOS` — and reveals the section when either populates. No placeholders ship. Logo wall supports linked items (with `rel=noopener` + `safeUrl()` protocol allowlist, matching Phase 6 XSS hardening) and an optional one-sentence case study per logo. Avatar colors rotate navy/amber/terra. When Justin collects real quotes or lands a verified employer, the swap is a single array-element edit in `index.html` — section appears on reload. **Done-when still gated on business action** (3 real quotes OR 1 verified logo), which is user-owned per the plan.

### 3. Legal sign-off + banner removal (lawyer-owned, 1 hour)

- **Outcome:** "v1 — under legal review" banners come off `privacy.html` + `terms.html`. Italicized "subject to counsel review" notes in Privacy §7 (state-specific rights) and Terms §10/§11 (warranty + liability) get replaced with cleared language.
- **Action:** 30-min lawyer-friend review over coffee. Edits commit in one PR. Bump "Effective date" on both pages to the review-completion date.
- **Done when:** banners removed, no italicized "subject to review" text remains, PR description captures lawyer sign-off (name + date, or a note).

### 4. Mobile QA artifact (founder-owned, 30 min)

- **Outcome:** `docs/mobile-qa-2026-04-XX.mp4` committed or Drive link pasted in `docs/mobile-qa-checklist.md`. Mobile moves from 7 → 8.
- **Action:** follow `docs/mobile-qa-checklist.md` on a real iPhone. All 5 golden paths + cross-cutting checks.
- **Done when:** recording saved, checklist filled, regressions logged. Sev 1–2 bugs fixed same-day; Sev 3 deferred.

### 5. Resume-purge cron (code, 2 hours)

- **Outcome:** The retention commitment in `privacy.html` §6 ("pruned during periodic review") gets backed by an actual scheduled job. Closes the one security-review finding we deferred from Phase 8 QA hotfix.
- **Action:** new function `prune-inactive-data` invoked weekly via `pg_cron`:
  - Delete `resumes` rows where `updated_at < now() - interval '24 months'` and the owning `job_seekers` row has no sign-in activity in that window.
  - Delete `match_scores` rows where `emailed_at < now() - interval '12 months'`.
  - Log counts to `console.log` for observability.
- **Done when:** migration + function + cron schedule + dry-run test (temporarily flip intervals to something testable, verify counts, flip back).

**Shipped (2026-04-23, code-side):** `supabase/functions/prune-inactive-data/index.ts` — server-to-server auth via `x-prune-secret` + `PRUNE_SECRET` env var, mirroring the `refresh-jobs` / `send-match-digest` pattern. Candidate resumes are gated both on `updated_at` cutoff AND the owning seeker's `auth.users.last_sign_in_at` (resolved via `supabase.auth.admin.getUserById`) so active accounts with old resumes are never touched. Storage-bucket objects are removed first (best-effort), then DB rows, then `match_scores` on the 12-month cutoff. Migration `20260423_phase9_prune_inactive_data.sql` schedules `cron.prune-inactive-data-weekly` at 15 UTC Sunday (11am EDT) — deliberately after the Friday digest so freshly emailed matches aren't swept in the same week. `config.toml` updated. **User action required:** seed `PRUNE_SECRET` in Supabase Vault + matching Edge Function secret, same pattern as `REFRESH_SECRET` / `DIGEST_SECRET`. Migration + function are 401-safe until both exist.

### 6. Plausible baseline (founder-owned, 5 min)

- **Outcome:** `workforceforhumans.com` domain verified in Plausible; 3 custom events (`CTA: employer-checkout-start`, `Event: resume-upload`, `Event: find-matches`) confirmed firing.
- **Done when:** screenshot of Plausible dashboard pasted into a Phase 9 follow-up note showing at least one day of traffic + one event of each kind.

### Phase 9 — out of scope (deferred to Phase 10+)

- Employer GTM pitch page + outbound sequence — real revenue plumbing, too big for this phase. Book it for Phase 10.
- Automated test suite — the single biggest lever to push Eng hygiene 8 → 9. Meaningful scope; Phase 10 or 11.
- Typography/spacing polish pass on member/employer surfaces — Design 8 → 9. Phase 11.
- Framework migration (Astro marketing + islands member) — still the 9 → 10 conversation; revisit only on the triggering signals named earlier in this doc.
- Per-job + per-KB-article real URLs — blocked on framework decision.
- Greenhouse/Lever job feeds as a second aggregator source — only if USAJobs quality (post-Claude-filter) proves thin. Revisit after one week of `filter:"claude"` data.

---

## Out of scope for reaching 9 (the original phase 1-5 list, kept for reference)

- Per-job real URLs (replacing `jobs.html?id=<uuid>` with `jobs/<slug>.html`). Blocked on framework decision.
- Per-article KB URLs (replacing `kb.html#article/<slug>`). Same block.
- Dynamic `sitemap.xml` regeneration covering jobs and KB articles.
- Seeded `platform_stats` so the hero stat cards show real counts. Content/business work, not code.
