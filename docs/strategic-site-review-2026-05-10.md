# Strategic Site Review — Seeker Conversion Path (2026-05-10)

**Reviewer lens:** Morgan Reeves (CSO persona) — Fortune 500 strategy voice, hold the bar high, push on conversion not polish.
**Scope:** Seeker conversion path only — `index.html`, `about.html`, `resume.html`, `member.html`, `kb.html`, `feed.html`, `learn.html`. Employer + admin pages out of scope this pass.
**Out of scope:** technical QA, mobile-device sweep (covered separately by `docs/mobile-qa-checklist.md`), employer pricing/copy, infra.

---

## Why this review now

- **Acquisition is the named bottleneck.** ~15k organic views in the last month, **0 new seekers in the trailing 14 days** as of the 2026-05-09 health check (per `ROADMAP.md` Phase 15 framing).
- That isn't a traffic problem — it's a conversion-thesis problem. PostHog instrumentation (Phase 15 §A) without a converting site = measured silence.
- Goal of this review: **identify the highest-leverage fixes that move that 0 before §A ships.** Anything that doesn't plausibly move a cold visitor toward sign-up is out of scope this pass.

## The visitor we're testing for

Anchor every test against this single composite seeker. If a finding doesn't matter to her, it doesn't matter.

> **"Karen, 52, displaced PM."** Was a Senior PM at a 2,000-person SaaS co. Laid off 90 days ago in an AI-justified reorg. Two interviews, no offers. Skeptical of LinkedIn, exhausted by ATS. Found WFH from an organic search — likely a Market Pulse blog tail or a kb article. Reading on her phone, in bed, 10pm. She has 60 seconds before she closes the tab.

## The four cross-cutting tests (run on every page)

| # | Test | Pass criteria | Failure mode to look for |
|---|---|---|---|
| 1 | **10-second wedge test** | Read only the above-the-fold; can a stranger paraphrase "WFH is a coach that places me, with jobs attached"? | Reads like a generic job board, generic SaaS, or generic upskilling tool. Words "find your next job" are a red flag. |
| 2 | **Hope + path test** | Page acknowledges the displacement reality AND gives a concrete next step within the same view. | Page lists problems without remedies (anxiety bomb), or skips empathy and goes straight to product features. |
| 3 | **Practitioner voice test** | Justin's lived voice is detectable — first person, specific, opinionated. | Sounds like a marketing copywriter wrote it. Generic claims, no specifics, no first-person. |
| 4 | **LinkedIn-clone anti-pattern test** | Page does NOT replicate features that incumbents win on (volume, DMs, reviews, network graph). | Anything that smells like a worse version of LinkedIn / Indeed / Dice. |

A page that fails 2+ of these is a Sev-1 fix candidate.

---

## Per-page tests

### 1. `index.html` — first impression (highest leverage)

**Karen's task here:** decide in <60s whether to go deeper or close the tab.

Test:
- [ ] Does the hero answer *who is this for* in plain language? ("for people whose role got reorged or AI'd," not "for everyone").
- [ ] Is the **coach wedge** visible above the fold, or is it implicit/buried?
- [ ] What is the primary CTA — does it serve **seeker** activation, or only employer checkout? (Today, only `CTA: employer-checkout-start` fires. That's a tell.)
- [ ] Is there ONE proof point (a number, a quote, a story) that earns belief in the next 10 seconds?
- [ ] Is "Meet the founder →" surfaced somewhere a skeptic would find it before signup?

Pass: a Karen-shaped reader gets to a seeker CTA (resume parse OR magic-link signup) within 30s of landing.
Fail: she scrolls, sees employer pricing as the dominant CTA, leaves.

### 2. `about.html` — founder credibility (the moat)

**Karen's task:** verify "is this person worth my trust."

Test:
- [ ] Does Justin's voice come through in **first person**, with specifics (companies, decisions, lessons)?
- [ ] Is the headshot real and recent? (Memory: PR #33 added a founder headshot.)
- [ ] Does it answer "why is *he* the right person to coach me, specifically"? Not "why workforce reskilling matters."
- [ ] Quantinuum references **removed** per PR #33 (verify) — is the current employer reference clean?
- [ ] Length: long enough to earn trust, short enough that a skeptic finishes it on her phone.

Pass: Karen finishes the page believing Justin has lived this. Fail: feels like an "About" page on any SaaS site.

### 3. `resume.html` — first valuable interaction (activation)

**Karen's task:** decide whether handing over her resume is worth it.

Test:
- [ ] Three input modes (paste / upload PDF / build) — is one **clearly recommended**, or does the choice paralyze?
- [ ] Does the page **pre-promise** what she gets on the other side? Specifically: "Claude reads your resume, identifies skill gaps, surfaces matches with a coach brief per match." If the promise isn't strong, the friction wins.
- [ ] Is signup gated *before* parse? If yes, is the value of signing up clearly stated *before* she's asked for an email?
- [ ] Tone check: does this feel like a coach reviewing your resume, or like submitting into an ATS black hole?
- [ ] What happens when parse takes >10 seconds — is there a credible loading state, or does she think it's broken?

Pass: Karen uploads a resume and gets visible value (member dashboard with matches + coach brief). Fail: she abandons mid-flow because the signup ask came too early or the promise was too vague.

### 4. `member.html` — the actual product

**Karen's task:** evaluate whether this is a coach or just another search box.

Test:
- [ ] Magic-link friction is real (open email, click, return). Was the promise on `index.html` / `resume.html` strong enough to earn it? If she hesitates here, the front-end copy needs work.
- [ ] **First 30 seconds post-auth:** what does she see? Is there a clear "here's what I learned about you, here's what I think you should do next"?
- [ ] **Match cards** (Phase 7 + Phase 13): does the rationale + growth_note + coach brief (`resume_tailoring`, `skill_gap_plan`, `application_strategy`) read as a **coach speaking to her specifically**, or as templated output? Sample 3 matches and judge.
- [ ] First-time onboarding: is there ANY guided "do these 3 things first" affordance, or is it a cold dashboard?
- [ ] "Find new matches" CTA — what's the wait time, what's the payoff, does she understand what's happening?
- [ ] Empty / sparse states: when she has 0 strong matches, does the page coach her ("here's how to broaden") or does it look broken?

Pass: she leaves the dashboard with a specific action she's going to take this week. Fail: she sees a list of jobs and bounces, indistinguishable from Indeed.

### 5. `kb.html` — likely organic landing page

**Karen's task:** read the article she came for, then decide whether WFH is more than a blog.

Test:
- [ ] If she lands on `#article/<slug>` from Google, does the article itself deliver value standalone?
- [ ] Is there a contextual CTA at the article's end that earns the next click? (Not a footer banner — something tied to the article's topic.)
- [ ] Does the kb visibly connect to the **product** ("here's how WFH would help you with this"), or does it feel like a side blog?
- [ ] Practitioner voice test: do articles feel written by Justin (or Justin-adjacent), or like generic SEO content?

### 6. `feed.html` — intelligence feed (proof of practitioner curation)

**Karen's task:** decide if WFH "gets it" about the workforce moment.

Test:
- [ ] Is the feed visibly **curated** (commentary, framing, hand-picked), or auto-aggregated? Memory says 8 RSS sources + auto-tagging — does it *look* hand-curated?
- [ ] `is_positive` tagging (Phase 12): are hopeful items surfaced, or is the feed a layoffs.fyi doom-scroll?
- [ ] Image extraction (Phase 12): do real items have real images, or is it a wall of text?
- [ ] Is there a "what does this mean for you" interpretation layer, or just headlines?
- [ ] Anti-pattern: does this feel like a worse version of LinkedIn News?

### 7. `learn.html` — learning paths

**Karen's task:** decide if there's actually a concrete reskilling path here.

Test:
- [ ] Are training resources **current** (verified within last 90 days, links work, prices accurate)?
- [ ] `training_skills` curation status — is the skills→training mapping populated, or empty? (Memory: hand-curated SQL via runbook §10.7.)
- [ ] For a displaced PM, is there a visible path that says "do these 3 things, in this order"?
- [ ] Anti-pattern: does this feel like Coursera-aggregator, or like a coach's recommended curriculum?

---

## Output format — what each finding becomes

Every finding from the review lands as a row in `docs/site-review-findings-2026-05-10.md` (created during the review pass) with:

| Field | Example |
|---|---|
| Page | `index.html` |
| Test failed | "10-second wedge test" |
| Severity | **S1** (blocks acquisition) / **S2** (degrades it) / **S3** (polish) |
| Symptom (one sentence) | "Hero leads with employer pricing; Karen sees no seeker CTA above the fold." |
| Proposed fix (one sentence) | "Swap hero variant to lead with `Get a coach's read on your resume in 60s` + `Upload resume` button." |
| Estimated effort | S / M / L |

**Severity bar:**
- **S1** — finding plausibly explains a chunk of the 0-seekers number. Fix this week, before Phase 15 §A.
- **S2** — degrades conversion but isn't the dominant blocker. Fix during Phase 15 §C cleanup deltas.
- **S3** — polish or aesthetic. Defer unless trivial.

## Review verification — how we know this review was useful

The review is useful if it produces:
1. **At least 1 S1 finding with a same-week fix queued** — otherwise we found nothing actionable and the lens was wrong.
2. **A coherent narrative** — every S1/S2 finding should ladder up to ONE thesis about why Karen isn't converting (not a grab-bag of disconnected nits).
3. **A clear go/no-go on Phase 15 §A** — if the site is fundamentally not converting, instrumenting it is premature; if it's close, instrument first then iterate.

## Out-of-scope, parked for later passes

- Mobile real-device sweep — `docs/mobile-qa-checklist.md` already covers it; re-run as part of Phase 15 §C.
- Employer-side review (`employer.html`, pricing, dashboard) — empty traffic, defer until Phase 15 §D.
- Technical / RLS / Stripe correctness — already validated by Phase 14 §B test coverage.
- A11y deep-dive — flag obvious blockers during the strategic review; full sweep is a Phase 16 §D candidate.
- Performance / Lighthouse — flag obvious blockers; defer rigor to post-launch.

## Sequence after this plan is approved

1. **Today:** founder approves this plan (or edits scope).
2. **Next session:** I (Morgan voice) walk the seeker path page-by-page using this checklist, log findings into `docs/site-review-findings-2026-05-10.md`.
3. **After review:** founder triages — pick which S1/S2 findings get queued as PRs, which get deferred.
4. **Cleanup PRs:** ship the S1 fixes. Each PR scoped tight, on its own branch.
5. **Then Phase 15 §A:** PostHog funnel instrumentation, against a site that now plausibly converts.
