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

**Open question:** confirm whether fulfillment already happens outside the repo. If yes, this phase shrinks to "document it in `CLAUDE.md`."

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

**Open question:** are there real numbers ready to pipe in, or do we need to seed real jobs first?

---

## Phase 5 — Buffer + re-rate (Fri May 22 → Thu May 28)

**Outcome:** The site scores ≥ 9 against the same rubric used on Apr 16, and we have a clear call on the next chapter.

- Fix what slipped.
- Re-rate against the 8-lens rubric (voice, design, product depth, AI, engineering hygiene, mobile, trust, accessibility/SEO). Publish the result back into this file.
- Decision: framework migration (Astro for marketing + islands for member) — yes / no / defer. Don't decide until the re-rate.

**Done when:** rubric shows ≥ 8 on every lens and ≥ 9 on voice, design, product depth, AI, and mobile.

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
