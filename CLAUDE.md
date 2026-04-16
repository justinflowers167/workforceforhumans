# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

WorkforceForHumans is a **static HTML marketing + member site** backed by **Supabase** (Postgres + Auth + Storage + Edge Functions). There is no build system, no package manager, no test suite, and no framework.

- Top-level `*.html` files are each a self-contained page: inline `<style>` and inline `<script>` in every file. They are served as static assets (e.g. via GitHub Pages / the production domain `workforceforhumans.com`).
- `supabase/functions/<name>/index.ts` are Deno Edge Functions deployed to the Supabase project.
- `content/market-pulse/YYYY-MM-DD.md` are weekly briefings authored as markdown (content-only; no renderer wired up in the site at present).

There is no `package.json`, no `README.md`, and no `.github/`, `.cursor/`, or `.cursorrules`.

## Commands

There is nothing to build, lint, or test locally.

- **Preview a page**: open the `*.html` file directly in a browser, or serve the repo root with any static server (e.g. `python3 -m http.server`). All pages talk to the live Supabase backend — there is no local DB.
- **Deploy an Edge Function**: `supabase functions deploy <name>` (requires Supabase CLI and project link to `dbomfjqijyrkidptrrfi`). The four functions are `create-checkout`, `parse-resume`, `match-jobs`, `send-match-digest`.
- **Invoke `send-match-digest` manually**: it's protected by the `DIGEST_SECRET` header `x-digest-secret`, not by user auth. It's the only function intended to be run server-to-server (e.g. pg_cron + http extension).

## Architecture

### Frontend: one file per page, no shared assets

Each HTML page duplicates the Supabase client setup, the CSS design tokens, and the nav. Do not try to extract a shared CSS/JS bundle — the site's deploy model is "drop HTML files on static hosting." If you change a color/token, update **every** page's `:root` block. Pages:

| Page | Role |
|---|---|
| `index.html` | Marketing homepage. Loads `platform_stats` + `jobs_full` for hero + featured jobs. |
| `jobs.html` | Job search/filter. Reads the `jobs_full` view. Supports `?q=` and `?state=` from URL. |
| `learn.html` | Learning paths (curated training resources). |
| `feed.html` | "Intelligence Feed": agencies, training resources, feed_items, feed_stats. |
| `kb.html` | Public knowledge base. Hash-based routing: `#/`, `#cat/<slug>`, `#article/<slug>`, `#search/<q>`. |
| `kb-admin.html` | Admin CRUD UI for `kb_articles`. No auth gate in the page itself — RLS is expected to enforce. |
| `resume.html` | Three input modes (paste / upload PDF or DOCX / build). Inserts a `resumes` row, then calls `parse-resume`. |
| `member.html` | Magic-link sign-in, profile editor, resume review display, match list, `Find new matches` (calls `match-jobs`). |
| `success.html` / `cancel.html` | Stripe redirect targets. |

The Supabase URL and anon key are **hardcoded in every page**: `https://dbomfjqijyrkidptrrfi.supabase.co`. This is expected (anon keys are public) — don't try to move them to env vars; there's no build step to inject them.

### Backend: Supabase Edge Functions (Deno)

All four functions follow the same pattern — keep new functions consistent with it:

```ts
// CORS preflight
if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

// For user-facing functions: verify the caller with the anon client, then use
// the service-role client for actual DB work.
const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } },
});
const { data: userData } = await userClient.auth.getUser();
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
```

- **`parse-resume`** and **`match-jobs`** use the Anthropic SDK with model **`claude-sonnet-4-6`**. Both parse model output by slicing from the first `{` to the last `}` — the system prompts instruct JSON-only output but the slice is defensive. Keep this pattern if you add another Claude call.
- **`parse-resume`** downloads from the `resumes` storage bucket and decodes PDF via `pdf-parse` and DOCX via `mammoth` (both from esm.sh). After parsing it updates `resumes`, `job_seekers`, and syncs `skills` + `job_seeker_skills` — upserting by lowercased name.
- **`match-jobs`** scores up to 50 active jobs for the authenticated seeker. The system prompt asks Claude to filter to score ≥ 40 and sort desc; the code then `.slice(0, 10)` on whatever the model returns (no code-side score filter). Before insert it deletes the seeker's non-emailed `match_scores` rows for `match_type = 'job'`, then inserts the fresh top-N.
- **`send-match-digest`** is auth'd by the `x-digest-secret` header (not user auth). It picks up `match_scores` rows with `emailed_at IS NULL` and `score >= 60`, groups by seeker, sends a single email per seeker via Resend, then stamps `emailed_at`. Respects `job_seekers.newsletter_opt_in = false`.
- **`create-checkout`** maps `plan` in `{basic, featured, employer}` to Stripe Price IDs via env vars. `employer` is a recurring subscription; the other two are one-time payments. Success/cancel URLs are derived from a `site_url` field sent by the caller.

### Known gap: Stripe fulfillment

`create-checkout` ends the flow in this repo — there is **no Stripe webhook handler** checked in (no `stripe-webhook` Edge Function, no `checkout.session.completed` consumer). That means nothing in the repo turns a paid checkout into an `employers` row, a listed `jobs` row, or any kind of entitlement. Fulfillment must be happening outside this repo (manually, via a Supabase function not in source control, or by a Zap / dashboard trigger), or it hasn't been built yet. Before touching the checkout flow, confirm where fulfillment actually happens — don't assume the browser → `create-checkout` path is the whole story.

### Data model conventions (from call sites)

The DB schema isn't checked in, but call sites reveal the expected shape:

- **Reads**: frontend reads use the `jobs_full` view (joined employer + flags) — not the `jobs` base table. The base `jobs` table is written to for analytics (`view_count`) and read by Edge Functions for scoring.
- **Auth linkage**: `job_seekers.auth_user_id` links to the Supabase auth user. Most member-scoped queries filter by `auth_user_id = session.user.id`.
- **Resumes**: only one `resumes` row per seeker should have `is_current = true`. `parse-resume` enforces this by flipping the others to false after a successful parse.
- **Matches**: `match_scores` is polymorphic via `match_type` (`'job'` is the only type currently used). `similarity` is 0–1, `score` is 0–100 — both are written. `emailed_at` gates digest sending.
- **KB**: hash routing in `kb.html` depends on `kb_articles.slug` being unique and `status = 'published'`. View counts are incremented client-side with a read-then-write (not atomic).

### Edge Function environment variables

Configure these via `supabase secrets set`:

- `ANTHROPIC_API_KEY` — for `parse-resume` and `match-jobs`.
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_FEATURED`, `STRIPE_PRICE_EMPLOYER` — for `create-checkout`. If a Price ID is missing, the function returns a 400 with the string `REPLACE` in the check — don't remove that guard.
- `RESEND_API_KEY`, `DIGEST_SECRET`, `DIGEST_FROM` (optional), `SITE_URL` (optional) — for `send-match-digest`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are auto-injected by Supabase.

## Conventions to follow

- **Don't introduce a build step, bundler, or framework.** The HTML-per-page architecture is deliberate. Changes to one page should not require editing others (except for shared design tokens in `:root`).
- **Keep Edge Function style uniform**: same `corsHeaders`, same `json(body, status)` helper, same auth pattern (user client for verification → admin client for work), same defensive JSON slice for Claude output.
- **Model ID**: use `claude-sonnet-4-6` for new Claude calls unless there's a reason to switch. Keep `max_tokens` bounded (current functions use 4000).
- **RLS is the source of truth for access control on browser reads.** The anon key is shipped to the client intentionally; any new tables the browser reads need matching RLS policies — do not work around this by pushing reads into an Edge Function unless there's a real reason.
- **Git workflow**: feature work happens on `claude/*` branches that are merged into `master` via PR (see `git log`). Do not commit directly to `master`.
