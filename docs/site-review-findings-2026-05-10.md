# Strategic Site Review — Findings (2026-05-10)

**Reviewer lens:** Morgan Reeves persona (CSO).
**Walked with:** Justin Flowers, founder.
**Pages walked:** 7 (seeker conversion path: `index`, `about`, `resume`, `member`, `kb`, `feed`, `learn`).
**Plan reference:** [`docs/strategic-site-review-2026-05-10.md`](strategic-site-review-2026-05-10.md).
**Output of this doc:** 18 findings (6 S1 + 12 S2) clustered into 5 remediation clusters, plus 3 parking-lot strategic threads. Five durable rules surfaced during the walkthrough live as memory files (outside the repo), referenced at the bottom.

---

## The single thesis (what the seven pages add up to)

The Karen-conversion gap (~15k organic views / 0 new seekers in 14 days as of 2026-05-09) is not caused by any one broken page. **Across all seven pages walked, the site does not consistently claim its own ground.**

CTAs (index), brand surfaces (member, resume), visuals (every page that uses icons), content depth (feed), and personalization (learn) all default toward *generic AI-aggregator* rather than *practitioner-coached career service*. Karen — a 52-year-old displaced PM, on her phone at 10pm, skeptical of AI tooling — lands and does not see anything that says *"this place is different from the things I already tried."* She bounces.

The fix is therefore not eighteen disconnected tweaks; it's a coordinated reclaiming of WFH's voice and posture across the surfaces Karen actually sees first. The clusters below are sequenced so that the highest-leverage voice work happens before the funnel gets instrumented.

---

## Findings

### S1 — fix before Phase 15 §A PostHog instrumentation

| ID | Page(s) | Symptom | Proposed fix | Effort |
|---|---|---|---|---|
| F1 | `index.html` | Hero is dominated by employer-pricing CTA; no seeker CTA above the fold (only `CTA: employer-checkout-start` event fires today) | Swap hero to seeker-first action: *"Get a coach's read on your resume in 60 seconds"* + Upload button; demote employer pricing block below the fold | S |
| F2 | `index.html` + cross-site mission band | Wedge sells *placement* generically (*"find work that fits your life"*) — could be Indeed; doesn't differentiate WFH | Reposition wedge to *"WFH coaches you to use AI so you become the candidate employers want — and places you when you're ready."* Carry into a thin mission band on every seeker page (see F18) | M |
| F3 | `member.html`, new KB articles | First-time post-auth experience is a cold dashboard; magic-link friction earned, but no *"do these 3 things first"* guidance | Layered onboarding: 60-sec founder video on dashboard for first-timers; KB article series titled *"Your first 5 minutes on WFH"*; tooltip pass on Find-matches / View-match / Update-resume CTAs | M |
| F4 | `member.html:50,393`; `resume.html:45,180`; `about.html:107` | Product surface speaks as Claude, not WFH (*"Claude's read on this match"*, *"Claude will extract"*, *"Asking Claude to review"*, *"Claude filters"*) — cedes brand, frames WFH as a Claude wrapper | Rename product-UX strings to *"Workforce's read on this match"* (or test variants like *"What we see in this match"*) and *"Our coach reads your resume"*. **Keep** `terms.html` + `privacy.html` Claude/Anthropic references — those are appropriate disclosure and shouldn't move. | S |
| F5 | Cross-site (founder cited specifically on `index.html` + `kb.html`) | AI-generated-looking icons across multiple pages signal *"AI-aggregator startup"* rather than *"practitioner-coached service"*; founder flagged on 2 of 7 pages without prompting — meta-signal that it's a real cumulative trust leak | Single sweep PR: replace icon set with hand-picked professional library (Lucide / Heroicons / Tabler — all free, all consistent); audit and remove decorative icons that don't carry meaning | S–M |
| F6 | `feed.html`, `intelligence-feed` function, `feed_items` schema | Feed plays LinkedIn News's volume-aggregation game and loses (single curator vs. tens of thousands of LinkedIn humans); current surface skews doom-scroll for a Karen-shaped reader who's already scared | Pivot from *news aggregator* to *hope + action signal*: default-suppress non-`is_positive` items at the top of the feed; add a *real-people* track (testimonials, member skill-building stories); add `founder_read` text column to `feed_items` for an optional 1-line founder interpretation per item; reduce volume, raise signal | M–L |

### S2 — fix during Phase 15 §C cleanup deltas (after §A instrumentation lands)

| ID | Page(s) | Symptom | Proposed fix | Effort |
|---|---|---|---|---|
| F7 | `index.html` | Hero claim lacks evidence; no proof point in the first 10 seconds of skimming | Lead with usage + cadence: *"Read by 15,000+ this month • New market briefing every Monday"* + named-founder byline. Defer real placement metrics until they exist | S |
| F8 | `about.html` | Voice reads *"overly generated, not too far off"* — AI-tone dilutes practitioner moat where it most needs to peak | Targeted rewrite injecting first-person specifics, scars, and opinions (*"the moment I decided to start WFH was…"*); preserve length, headshot, and current employer-clean state | S–M |
| F9 | `resume.html` | Three input modes (paste / upload / build) — paste is redundant with upload (anyone with plain text already has a doc) | Drop paste-text mode; reduce to upload PDF/DOCX + build-from-scratch; reposition build-from-scratch as a real activation path, not a fallback | S |
| F10 | `resume.html` | Pre-promise too vague — Karen doesn't see *what she gets back* before she risks her input | Add *"See an example"* lightbox with one anonymized real parse + match + coach brief (founder's own data, anonymized — proof is real, not synthetic) | M |
| F11 | `member.html` (match cards), possibly `match-jobs` prompt | Numerical match score (e.g. 47/100) presented coldly can make Karen feel underqualified for roles she's actually qualified for — undermines coach posture | Replace number with qualitative tier (*Strong fit / Stretch / Growth opportunity*); pair every tier with a coach-toned single sentence; consider hiding low scores by default with *"see broader matches"* expand | M |
| F12 | `assets/site.js`, `feedback` schema | Feedback widget captures global feedback only; no per-article signal from KB readers | Add `context_url` (or `article_slug`) column to `public.feedback`; auto-stamp current article slug on widget submissions from KB pages. Existing Claude-Haiku triage (`claude_summary` + `claude_priority`) gives founder a prioritized queue automatically | S |
| F13 | KB content ops (process, not code) | KB articles can rot vs current market demand | Founder-manual review cycle initially: monthly calendar reminder to review N articles, supported by `feed_items` data as input. **Don't** build automation infra before doing it once by hand. Automate later (Phase 16 candidate) | S (process); deferred infra |
| F14 | `kb.html`, possibly KB article schema | KB articles end with generic CTAs; no visible funnel back to product | Every article ends with a contextual CTA tied to its topic (*"This article covers resume keywords — try our resume parse"*); funnels organic readers into the seeker product | S–M |
| F15 | `intelligence-feed` function | Some RSS items have extra characters in descriptions (HTML entities, smart quotes, control chars surviving the parse) | Normalize on insert: strip HTML tags, decode entities, trim whitespace, drop control chars. Ship in same PR as F6 if helpful | S |
| F16 | `intelligence-feed` function | Some feed items aren't relevant to WFH audience | Confirm whether Haiku relevance filter exists for `intelligence-feed` (it does for `refresh-jobs`); if not, add it; if yes, tighten threshold or prompt | S |
| F17 | `learn.html`, `job_seekers` schema | Generic surface tries to serve healthcare + tech + trades + logistics + finance simultaneously — overwhelming, doesn't feel curated | Add domain-track selector at top (chips or drop-down); persist selection to `job_seekers` so it carries to member.html match cards. Strengthens to S1 if traffic data shows learn.html as a frequent organic landing page | M |
| F18 | Cross-site seeker pages | Mission visibility weak — coach/serve narrative not consistent across surfaces | Thin two-sentence mission band on every seeker-facing page; consistent voice; ship as part of F2 wedge work to keep voice cohesive | S |

### Parking-lot — separate sessions, NOT gating Phase 15

| Topic | Why it's parked | Owner / next step |
|---|---|---|
| Auth method deep-dive | Real trade-offs (magic-link vs password+2FA vs passkeys/WebAuthn) with ICP implications (tail-end-of-career users prefer passwords); founder explicitly asked for a deep-dive session, not a quick fix | Founder requests when ready; Morgan preps options framed against Karen's phone-at-10pm UX |
| Paid seeker tier (monetization path from KB) | Today: free seeker / paid employer. *"How does KB tie to something they paid for?"* implies either funnel-to-free-product (default) or new paid seeker tier. Recommend funnel-to-free-product for Phase 15 (covered by F14); paid-tier conversation is a Phase 16 strategic call | Phase 16 candidate; queue when Phase 15 §D employer pipeline data exists |
| AI-coach deep dive (career-copilot extensions, interactive coach surfaces) | Founder wants to deep-dive on coach-as-AI angle; connects to existing `project_career_copilot_direction` memory and shipped Phase 13 coach-brief work | Own session; queue for Phase 16 sequencing decision |
| Founder video on About page (S3 from page 1) | Real lift; deferred to fold into F3 onboarding video (a single recording can serve both surfaces) | Ship as part of F3 |

---

## Remediation sequence (clusters, not findings)

Cluster ordering matters more than per-finding ordering within. Lead with surface voice (highest leverage per LOC), then homepage, then activation, then content moat, then content depth.

### Cluster A — surface voice (week 1, ~3-4 days)

**Goal:** flip the surface from *"AI-aggregator"* to *"WFH-coach"* via low-LOC, high-leverage brand work.

- **F4** — de-Claude rebrand in product UX (`member.html`, `resume.html`, `about.html`)
- **F5** — icon sweep (cross-site)
- **F8** — about.html voice rewrite
- **F18** — mission band (cross-site, paired with F2)

Three small PRs, mergeable independently. Together they remove the cumulative trust leak that surfaced ~5 times across the review.

### Cluster B — homepage repositioning (week 1–2, ~2-3 days)

**Goal:** seeker-first hero, sharpened wedge, one credible proof point.

- **F1** — CTA hierarchy inversion
- **F2** — wedge sharpening to AI-fluency-coaching (paired with F18 mission band)
- **F7** — proof points (usage + cadence)

Single coordinated PR (hero rewrite). **Most likely single biggest needle-mover on the 0-seekers number.**

### Cluster C — activation flow (week 2–3, ~1-2 weeks)

**Goal:** post-conversion: get Karen from sign-up to *"I see what to do next"* in 30 seconds.

- **F3** — onboarding tutorial (video + KB series + tooltips)
- **F9** — drop paste-text input
- **F10** — pre-promise example lightbox
- **F11** — score sensitivity (qualitative tiers)
- **F17** — learn.html domain-track filter

Phaseable internally — ship F3 video first, KB articles + F17 next, F9 + F10 + F11 last.

### Cluster D — feed pivot (week 2–3, ~1-2 weeks, can run parallel with C)

**Goal:** make the practitioner-curation moat actually visible.

- **F6** — hope + action signal pivot (`founder_read` field, `is_positive` default surface, real-people track)
- **F15** — RSS sanitization
- **F16** — Haiku relevance filter

Big work but gates the moat narrative. Worth doing now rather than waiting for Phase 16 intelligence-feed v2.

### Cluster E — content depth (week 3–4)

**Goal:** close the KB → product funnel; start the freshness review cycle.

- **F12** — per-article feedback widget
- **F13** — manual freshness review process
- **F14** — KB article CTA → product

---

## Phase 15 §A go/no-go

**Recommendation: NO-GO until Cluster A + Cluster B ship. Then GO.**

Instrumenting a funnel before fixing the inverted CTA hierarchy (F1) and the brand leakage (F4) would just give us high-resolution data on a non-converting site. Cluster A + B together ≈ 1–2 weeks of focused work; the funnel events Phase 15 §A measures will be far more interpretable against a site that has reclaimed its voice.

After A + B: **GO** on §A. Do NOT wait for C / D / E to complete — those refinements happen *with* funnel data informing them.

---

## Memory-side rules captured

Five durable rules surfaced during this review live as memory files in `~/.claude/projects/C--Users-justi-Documents-workforceforhumans/memory/` (outside the repo) because they apply to all future work, not just this review:

- `feedback_no_concurrent_employer_refs.md` — WFH content must not reference founder's concurrent employment.
- `feedback_no_ai_slop_visuals.md` — AI-slop visuals/copy undermine the practitioner credibility moat; default to hand-picked + first-person.
- `feedback_coach_not_doer.md` — WFH recommends; the user does the work. Filter Phase 16 career-copilot extensions through this rule.
- `feedback_claude_is_plumbing.md` — Claude is plumbing, not brand. Surface speaks as WFH; AI disclosure lives in terms/privacy/about only.
- `feedback_ai_cost_economics.md` — AI features must clear cost-economics threshold; pointed AI use over broad/automated use until revenue supports it.

These auto-load via `MEMORY.md` on future sessions.
