# Mobile QA Checklist — Launch Readiness Week

**Owner:** Justin (needs a real iPhone or 412px Android)
**Intended date:** 2026-04-25 (Sat)
**Done when:** Each of the 5 golden paths completes on a 375px viewport with no layout break, no hidden nav, and every tap target ≥ 44px. A screen recording is saved alongside this file.

---

## How to run

1. Record screen with audio narration on a real device (not DevTools). Keep it ~3–5 minutes total.
2. Walk each golden path in order below. Tick the box when done. Note any regression in the "Issues" column.
3. Save the capture as `docs/mobile-qa-2026-04-25.mp4` (or link a Google Drive URL in the Result section).
4. Any Sev 1–2 regression → ticket immediately; Sev 3 → defer to Phase 9 polish.

---

## 5 golden paths

| # | Path | Entry | Steps | Expected | ☐ | Issues |
|---|---|---|---|---|---|---|
| 1 | Browse jobs with filters | `/jobs.html` | Open, apply 1 category filter, apply remote-only, scroll list, tap a card | Filter chips wrap cleanly; list cards don't overflow; modal opens; USAJobs source chip legible; apply CTA opens external URL in new tab | ☐ | |
| 2 | Magic-link sign-in | `/member.html` | Enter email, tap Send, open email on device, tap magic link | Form inputs full-width; tap targets ≥ 44px; post-auth redirect lands on dashboard; no drawer overlap | ☐ | |
| 3 | Resume upload + review | `/resume.html` | Upload a PDF, wait for parse, scroll review | Tab switcher usable; upload button ≥ 44px; review sections stack vertically; no horizontal scroll | ☐ | |
| 4 | View matches (Phase 7) | `/member.html` | Tap "Find new matches", wait, scroll list, expand a disclosure | Cards fit viewport; "Claude's read on this match" summary wraps; disclosure marker visible; `Next edge:` label readable in terra; paragraphs don't overflow | ☐ | |
| 5 | Employer checkout start | `/index.html#employers` | Scroll to pricing, tap a plan, fill name+email, tap checkout CTA | Pricing cards stack; form inputs full-width; checkout button ≥ 44px; redirect to Stripe | ☐ | |

---

## Cross-cutting checks

- [ ] Hamburger + drawer open/close cleanly (marketing + member variants)
- [ ] Drawer links keyboard-focusable (tab through on an external keyboard if handy)
- [ ] `about.html` headshot placeholder renders; 400-word body wraps; LinkedIn + contact row stack on narrow viewport
- [ ] `privacy.html` + `terms.html` TOC anchors scroll to the right section; amber "v1 — under legal review" banner visible and readable
- [ ] Footer links wrap in 1–2 columns on narrow; Privacy + Terms now go to `/privacy.html` + `/terms.html` (not mailto)
- [ ] "Meet the founder →" hero note on index.html amber underline visible and tap-sized
- [ ] PostHog **Live events** view shows an event for each of the three custom triggers: `CTA: employer-checkout-start`, `Event: resume-upload`, `Event: find-matches` (Cloudflare Web Analytics shows the matching pageviews)
- [ ] No CSP console errors on `us.i.posthog.com`, `us-assets.i.posthog.com`, or `static.cloudflareinsights.com`

---

## Slip budget

If real-device access isn't available this weekend:
- Run DevTools device mode at 375×667 (iPhone SE) as a fallback for paths 1–5. Note that touch affordances are worse than real-device.
- Defer the artifact commit to the first day of Phase 9 (tag as Phase 9 item).
- Do NOT block public launch on this alone — but do not launch without at least a DevTools pass.

---

## Result

*(fill in on completion)*

- **Date run:**
- **Device:**
- **Recording:** `docs/mobile-qa-2026-04-25.mp4` OR `[Drive link]`
- **Regressions found:**
- **Sign-off to launch:** ☐ yes ☐ no (reason: …)
