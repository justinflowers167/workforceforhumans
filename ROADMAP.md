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
