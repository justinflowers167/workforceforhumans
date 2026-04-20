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
- **Deploy an Edge Function**: `supabase functions deploy <name>` (requires Supabase CLI and project link to `dbomfjqijyrkidptrrfi`). The seven functions are `create-checkout`, `stripe-webhook`, `link-employer`, `parse-resume`, `match-jobs`, `send-match-digest`, `intelligence-feed`.
- **Apply a SQL migration**: files under `supabase/migrations/<timestamp>_<name>.sql` run via Supabase MCP `apply_migration` (or `supabase db push` if linked locally). Apply in filename order. `00000000_baseline_schema.sql` is the full public-schema snapshot (captured 2026-04-19 via MCP introspection) and must apply first; it is idempotent so running it against the live DB is a no-op. Dated Phase-3 migrations layer on top.
- **Invoke `send-match-digest` manually**: it's protected by the `DIGEST_SECRET` header `x-digest-secret`, not by user auth. It's the only function intended to be run server-to-server (e.g. pg_cron + http extension).
- **`stripe-webhook` is server-to-server** (Stripe → Supabase). Authenticated by Stripe signature verification on the raw body. `verify_jwt = false` in `supabase/config.toml` — do not change.

## Architecture

### Frontend: one file per page, shared chrome in `/assets/`

Each HTML page is a self-contained document, but design tokens, the universal reset, the nav, and the footer live in two shared files:

- `/assets/site.css` — tokens in `:root`, universal reset, base typography, shared utility classes (`.btn-ghost`, `.btn-amber`, etc.), canonical nav + footer CSS, breakpoint vars. Navy has a `body[data-surface="product"]` override for product pages.
- `/assets/site.js` — vanilla-JS IIFE. Reads `document.body.dataset.nav` (`marketing` / `member` / `admin` / `employer`), renders the matching nav into `<div id="site-nav"></div>`, renders the footer into `<div id="site-footer"></div>`, marks the active link from `location.pathname`. Runs synchronously at the top of `<body>` so nav/footer are in the DOM before any `DOMContentLoaded` / `hashchange` handlers bind.

Every page declares its variant via body attributes — e.g. `<body data-nav="marketing">` (marketing), `<body data-nav="member" data-surface="product">` (member), `<body data-nav="admin" data-surface="product">` (kb-admin), `<body data-nav="employer" data-surface="product">` (employer dashboard). Pages also include a minimal `<noscript>` nav fallback and page-specific CSS only (hero layouts, page-local classes). **Do not duplicate tokens, nav markup, or footer markup in page HTML** — change `site.css` once, every page updates.

Verify with:

```bash
grep -c "<nav" *.html            # must print 0 for every page (<noscript> nav uses lowercase, won't match the canonical regex above if you prefer `grep -En "^\s*<nav"` — use whatever check catches duplicated chrome)
grep -rn "^\s*--amber:" *.html   # must print nothing
grep -rn "^\s*--navy:" *.html    # must print nothing
```

Deploy model unchanged: drop HTML files + `/assets/*` on static hosting (Cloudflare Pages). No build step, no bundler.

Pages:

| Page | Role |
|---|---|
| `index.html` | Marketing homepage. Loads `platform_stats` + `jobs_full` for hero + featured jobs. |
| `jobs.html` | Job search/filter. Reads the `jobs_full` view. Supports `?q=` and `?state=` from URL. |
| `learn.html` | Learning paths (curated training resources). |
| `feed.html` | "Intelligence Feed": agencies, training resources, feed_items, feed_stats. |
| `kb.html` | Public knowledge base. Hash-based routing: `#/`, `#cat/<slug>`, `#article/<slug>`, `#search/<q>`. |
| `kb-admin.html` | Admin CRUD UI for `kb_articles`. Magic-link sign-in + email allowlist via `kb_editor_emails` table. RLS on `kb_articles` enforces the same allowlist server-side. |
| `resume.html` | Three input modes (paste / upload PDF or DOCX / build). Inserts a `resumes` row, then calls `parse-resume`. |
| `member.html` | Magic-link sign-in, profile editor, resume review display, match list, `Find new matches` (calls `match-jobs`). |
| `employer.html` | Magic-link sign-in for paying employers. Lists paid `job_postings` awaiting fulfillment, lets the buyer create the `jobs` row, manages active listings + subscription status. |
| `success.html` / `cancel.html` | Stripe redirect targets. `success.html` directs the buyer into `employer.html`. |

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
- **`create-checkout`** accepts `{plan, email, name, site_url}` from the browser. Plans `basic` / `featured` are one-time payments; `employer` is a $499/mo subscription. The function upserts the `employers` row, creates a Stripe customer if missing, inserts a `job_postings` row in `pending` state for one-time plans, and includes `{employer_id, job_posting_id, plan}` in `session.metadata` (plus `client_reference_id = employer.id`) so the webhook can fulfill. Uses inline `price_data` — no `STRIPE_PRICE_*` env vars needed.
- **`stripe-webhook`** receives Stripe events. Verifies signature on the **raw body** with `constructEventAsync` (sync `constructEvent` throws in Deno). Idempotent via `stripe_webhook_events.stripe_event_id unique` (insert-then-process; duplicates short-circuit with `200 {idempotent:true}`). Failed events do NOT auto-retry — diagnose via `stripe_webhook_events.error_message`, then clear the row to allow re-delivery from the Stripe dashboard. Handles: `checkout.session.completed` (marks `job_postings` paid + sends Resend confirmation email via `EdgeRuntime.waitUntil` to stay under Stripe's 10s budget), `customer.subscription.created|updated|deleted` (syncs `employers.subscription_status` + `subscription_current_period_end`), `checkout.session.expired` (marks posting failed), `invoice.paid` (logged; period_end refreshed by the subsequent `subscription.updated`).
- **`link-employer`** fallback for buyers whose `auth.users` row predates checkout (so the `on_auth_user_created_link_employer` DB trigger never fired). Verifies the JWT, finds an unlinked `employers` row by `lower(contact_email) = lower(user.email)`, stamps `auth_user_id`. Idempotent. Called from `employer.html` boot when no employer is linked yet.
- **`intelligence-feed`** news/layoff aggregator (RSS, layoffs.fyi, WARN Act stubs) into `feed_items` + OpenAI embeddings. Captured verbatim from the deployed function — coordinate redeploy if you change it.

### Data model conventions (from call sites)

The DB schema isn't checked in, but call sites reveal the expected shape:

- **Reads**: frontend reads use the `jobs_full` view (joined employer + flags) — not the `jobs` base table. The base `jobs` table is written to for analytics (`view_count`), read by Edge Functions for scoring, and read/written by `employer.html` for the owning employer's listings (RLS gates by `employer_id IN (SELECT id FROM employers WHERE auth_user_id = auth.uid())`).
- **Auth linkage**: both `job_seekers.auth_user_id` and `employers.auth_user_id` link to the Supabase auth user. For `employers`, the link is stamped by an `auth.users` insert trigger (`on_auth_user_created_link_employer`) that matches `contact_email` case-insensitively; the `link-employer` Edge Function is the fallback for buyers who already had an `auth.users` row.
- **Resumes**: only one `resumes` row per seeker should have `is_current = true`. `parse-resume` enforces this by flipping the others to false after a successful parse.
- **Matches**: `match_scores` is polymorphic via `match_type` (`'job'` is the only type currently used). `similarity` is 0–1, `score` is 0–100 — both are written. `emailed_at` gates digest sending.
- **Stripe / fulfillment**: `job_postings` is the per-purchase ledger. `create-checkout` inserts `status='pending'` rows; `stripe-webhook` flips them to `'paid'` and stamps `stripe_event_id` (defense-in-depth idempotency on top of the `stripe_webhook_events` audit table). `employer.html` is the surface where a `paid` posting becomes a `jobs` row (the dashboard inserts `jobs` then sets `job_postings.job_id`). The `employer` plan is a subscription with **unlimited active listings while `subscription_status = 'active'`** — there is no per-period counter.
- **KB**: hash routing in `kb.html` depends on `kb_articles.slug` being unique and `status = 'published'`. View counts are incremented client-side with a read-then-write (not atomic). Write access (insert/update/delete) is gated by `kb_editor_emails` allowlist via RLS — adding a new editor is a single SQL insert into that table.

### Edge Function environment variables

Configure these via `supabase secrets set`:

- `ANTHROPIC_API_KEY` — for `parse-resume` and `match-jobs`.
- `STRIPE_SECRET_KEY` — for `create-checkout` and `stripe-webhook`. (Plan amounts are inline in `create-checkout`; no `STRIPE_PRICE_*` env vars are used.)
- `STRIPE_WEBHOOK_SECRET` — for `stripe-webhook` signature verification.
- `RESEND_API_KEY`, `DIGEST_SECRET`, `DIGEST_FROM` (optional) — for `send-match-digest`.
- `EMAIL_FROM` (optional, defaults to `Workforce for Humans <hello@workforceforhumans.com>`) — for `stripe-webhook` confirmation emails.
- `SITE_URL` (optional) — used by `send-match-digest` and `stripe-webhook`.
- `OPENAI_API_KEY` — for `intelligence-feed` embeddings. Optional; if missing, embedding step is skipped.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are auto-injected by Supabase.

## Conventions to follow

- **Don't introduce a build step, bundler, or framework.** The HTML-per-page architecture is deliberate. Shared design tokens, nav, and footer live in `/assets/site.css` + `/assets/site.js`; per-page CSS/JS stays inline in that page.
- **Keep Edge Function style uniform**: same `corsHeaders`, same `json(body, status)` helper, same auth pattern (user client for verification → admin client for work), same defensive JSON slice for Claude output. Server-to-server functions (`stripe-webhook`, `intelligence-feed`, `create-checkout`) are declared `verify_jwt = false` in `supabase/config.toml` — keep that file in sync when adding new functions of that shape.
- **Stripe webhook idempotency**: every event lands in `stripe_webhook_events` keyed by `stripe_event_id`. Insert-then-process; conflict short-circuits. Failed events do NOT auto-retry — fix the cause then clear the audit row to re-deliver. Don't bypass the audit table for new event handlers.
- **Model ID**: use `claude-sonnet-4-6` for new Claude calls unless there's a reason to switch. Keep `max_tokens` bounded (current functions use 4000).
- **RLS is the source of truth for access control on browser reads and writes.** The anon key is shipped to the client intentionally; any new tables the browser touches need matching RLS policies — do not work around this by pushing reads into an Edge Function unless there's a real reason. The webhook bypasses RLS via service-role; that's the only sanctioned bypass.
- **Deploy order matters for Stripe changes**: migrations → `stripe-webhook` → `link-employer` → `intelligence-feed` → `create-checkout` → HTML. Reversing the function order can desync metadata between checkout and webhook, silently breaking fulfillment.
- **Git workflow**: feature work happens on `claude/*` branches that are merged into `master` via PR (see `git log`). Do not commit directly to `master`.
