# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project shape

WorkforceForHumans is a **static HTML marketing + member site** backed by **Supabase** (Postgres + Auth + Storage + Edge Functions). There is no build system, no package manager, no test suite, and no framework.

> **Terminology — read before editing any job-feed or matching code.** "WFH" throughout this repo (code, comments, markdown, migrations) refers to **Workforce for Humans** — the product name. It is **NOT** shorthand for "work-from-home". The platform serves displaced workers and career changers; **onsite, hybrid, and remote roles are all in scope** because the audience includes people willing to commute or relocate. Anything that restricts the feed to remote-only (e.g. `RemoteIndicator=True`, "remote-only" prompts) is a bug, not a feature. The per-row `is_remote` flag is fine — it drives display chips and respects seeker `open_to_remote` preferences.

- Top-level `*.html` files are each a self-contained page: inline `<style>` and inline `<script>` in every file. They are served as static assets (e.g. via GitHub Pages / the production domain `workforceforhumans.com`).
- `supabase/functions/<name>/index.ts` are Deno Edge Functions deployed to the Supabase project.
- `content/market-pulse/YYYY-MM-DD.md` are weekly briefings authored as markdown (content-only; no renderer wired up in the site at present).

There is no `package.json`, no `README.md`, and no `.github/`, `.cursor/`, or `.cursorrules`.

## Commands

There is nothing to build, lint, or test locally.

- **Preview a page**: open the `*.html` file directly in a browser, or serve the repo root with any static server (e.g. `python3 -m http.server`). All pages talk to the live Supabase backend — there is no local DB.
- **Deploy an Edge Function**: `supabase functions deploy <name>` (requires Supabase CLI and project link to `dbomfjqijyrkidptrrfi`). The ten functions are `create-checkout`, `stripe-webhook`, `link-employer`, `parse-resume`, `match-jobs`, `send-match-digest`, `intelligence-feed`, `refresh-jobs`, `prune-inactive-data`, `submit-feedback`.
- **Apply a SQL migration**: files under `supabase/migrations/<timestamp>_<name>.sql` run via Supabase MCP `apply_migration` (or `supabase db push` if linked locally). Apply in filename order. `00000000_baseline_schema.sql` is the full public-schema snapshot (captured 2026-04-19 via MCP introspection) and must apply first; it is idempotent so running it against the live DB is a no-op. Dated Phase-3 migrations layer on top.
- **Invoke `send-match-digest` manually**: it's protected by the `DIGEST_SECRET` header `x-digest-secret`, not by user auth. Cron-fired weekly via pg_cron + pg_net.
- **Invoke `refresh-jobs` manually**: same server-to-server pattern — `REFRESH_SECRET` env var + `x-refresh-secret` request header. Cron-fired daily at 11 UTC (7am EDT) via pg_cron + pg_net (wired Tue 2026-04-21).
- **Invoke `prune-inactive-data` manually**: same server-to-server pattern — `PRUNE_SECRET` env var + `x-prune-secret` request header. Cron-fired weekly Sunday at 15 UTC (11am EDT) via pg_cron + pg_net. Deletes stale `resumes` (24-month retention, gated on seeker sign-in activity) and `match_scores` (12-month post-email retention); also removes the underlying storage objects.
- **Invoke `intelligence-feed` manually**: same server-to-server pattern — `INTELLIGENCE_FEED_SECRET` env var + `x-intelligence-feed-secret` request header. Cron-fired daily at 12 UTC (8am EDT) via pg_cron + pg_net (wired Phase 12, 2026-04-27). Pulls 8 RSS sources + layoffs.fyi into `feed_items`, generates OpenAI embeddings.
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
- **`parse-resume`** downloads from the `resumes` storage bucket. **PDFs are sent directly to Claude as a `document` content block** — `pdf-parse` was dropped in Phase 9 hotfixes (2026-04-25) because esm.sh kept failing to serve it on Deno cold-starts; Sonnet 4.6 reads PDFs natively with better layout understanding (columns, tables) than text-stripping anyway. **DOCX still uses `mammoth` (lazy-loaded inside the function)** so a future esm.sh hiccup with mammoth returns a clean 500 instead of crashing the whole function. After parsing, `parse-resume` updates `resumes`, `job_seekers`, and syncs `skills` + `job_seeker_skills` — upserting by lowercased name. The `is_current=true` re-assert at the end of a successful parse is now redundant with the `trg_resumes_flip_others` DB trigger (which enforces the one-current invariant in the same transaction as any insert/update) but harmless.
- **`match-jobs`** scores up to 50 active jobs for the authenticated seeker. The system prompt asks Claude to filter to score ≥ 40 and sort desc; the code then `.slice(0, 10)` on whatever the model returns (no code-side score filter). Before insert it deletes the seeker's non-emailed `match_scores` rows for `match_type = 'job'`, then inserts the fresh top-N.
- **`send-match-digest`** is auth'd by the `x-digest-secret` header (not user auth). It picks up `match_scores` rows with `emailed_at IS NULL` and `score >= 60`, groups by seeker, sends a single email per seeker via Resend, then stamps `emailed_at`. Respects `job_seekers.newsletter_opt_in = false`.
- **`create-checkout`** accepts `{plan, email, name, site_url}` from the browser. Plans `basic` / `featured` are one-time payments; `employer` is a $499/mo subscription. The function upserts the `employers` row, creates a Stripe customer if missing, inserts a `job_postings` row in `pending` state for one-time plans, and includes `{employer_id, job_posting_id, plan}` in `session.metadata` (plus `client_reference_id = employer.id`) so the webhook can fulfill. Uses inline `price_data` — no `STRIPE_PRICE_*` env vars needed.
- **`stripe-webhook`** receives Stripe events. Verifies signature on the **raw body** with `constructEventAsync` (sync `constructEvent` throws in Deno). Idempotent via `stripe_webhook_events.stripe_event_id unique` (insert-then-process; duplicates short-circuit with `200 {idempotent:true}`). Failed events do NOT auto-retry — diagnose via `stripe_webhook_events.error_message`, then clear the row to allow re-delivery from the Stripe dashboard. Handles: `checkout.session.completed` (marks `job_postings` paid + sends Resend confirmation email via `EdgeRuntime.waitUntil` to stay under Stripe's 10s budget), `customer.subscription.created|updated|deleted` (syncs `employers.subscription_status` + `subscription_current_period_end`), `checkout.session.expired` (marks posting failed), `invoice.paid` (logged; period_end refreshed by the subsequent `subscription.updated`).
- **`link-employer`** fallback for buyers whose `auth.users` row predates checkout (so the `on_auth_user_created_link_employer` DB trigger never fired). Verifies the JWT, finds an unlinked `employers` row by `lower(contact_email) = lower(user.email)`, stamps `auth_user_id`. Idempotent. Called from `employer.html` boot when no employer is linked yet.
- **`intelligence-feed`** news + workforce-trend aggregator. Phase 12 (2026-04-27) rewrite: x-intelligence-feed-secret server-to-server auth, 8 RSS sources biased toward neutral/positive (TechCrunch layoffs, BLS, US DOL ETA, Indeed Hiring Lab, Course Report, O*NET, Khan Academy, GovExec Workforce) + layoffs.fyi CSV, image extraction from `<media:content>` / `<enclosure>` / `<image>` RSS elements (stored in `feed_items.image_url`), `is_positive` auto-tagging for hiring/training/opportunity items. WARN Act stub deleted (was a no-op). OpenAI embeddings for semantic search via `text-embedding-3-small`. Cron-fired daily 12 UTC.
- **`submit-feedback`** Phase 12 §B2 (2026-04-27) — anon-callable from the floating feedback widget in `/assets/site.js`. Validates length + category, drops bot submissions silently via honeypot, optional Claude Haiku 4.5 triage stamps `claude_summary` + `claude_priority` (p0–p3) per row in `public.feedback`. Founder reads via runbook §8.7 SQL. `verify_jwt = false` in `supabase/config.toml`.
- **`refresh-jobs`** pulls Workforce-for-Humans-relevant public roles from USAJobs.gov daily. Auth'd by `x-refresh-secret` header (`REFRESH_SECRET` env var). Candidates are fetched across 8 federal-job-series-aligned phrase buckets (management analyst, program analyst, budget analyst, contract specialist, human resources, IT specialist, administrative, project coordinator) with no `RemoteIndicator` restriction — onsite/hybrid/remote all land in the pool. After ID dedup, a secondary `(title, location_city, location_state)` dedup pass strips near-duplicates (multi-vacancy postings, regional re-listings). Filters candidates through `claude-haiku-4-5` for WFH-audience relevance (entry-to-mid-level, skills-based; any work location; senior in scope when realistic) when `ANTHROPIC_API_KEY` is set, otherwise pass-through. Claude also returns `experience_level` per kept row, which overrides the title/grade-derived value before upsert (Phase 10 §B1, 2026-04-26 — fixes the prior bug where USAJobs rows missing `JobGrade` defaulted to `entry-level` and mis-tagged supervisory/senior roles). Upserts into `jobs` with `source='usajobs'`, `source_ref=<MatchedObjectId>`, `source_url=<ApplyURI>`, and `employer_id` pointing to the fixed synthetic `00000000-0000-0000-0000-00000000a001` "USAJobs — external feed" row. Idempotent via the `jobs_source_ref_key` partial unique index on `(source, source_ref) where source_ref is not null`. Phase 9 tuning (v9, 2026-04-24) swapped the four single-word buckets and dropped the remote-only URL filter after discovering the original config mistook "WFH" for work-from-home and starved the feed at 7 rows/day. Phase 10 §A (2026-04-26) tightened `PRE_FILTER_MAX` 200 → 100 and switched the relevance-filter model Sonnet 4.6 → Haiku 4.5 for ~10× cron cost reduction.
- **`prune-inactive-data`** has two modes, both gated by `x-prune-secret`. **Default cron mode** (empty body): weekly retention purge — deletes `resumes` rows with `updated_at < now() - 24 months` when the owning `job_seekers` row has no sign-in activity in that same window (resolved via `supabase.auth.admin.getUserById` on each candidate's `auth_user_id`). Also removes the backing `resumes` storage bucket objects (best-effort). Then deletes `match_scores` where `emailed_at < now() - 12 months`. Scheduled Sunday 15 UTC (11am EDT) — deliberately after the Friday digest cron so freshly emailed matches aren't swept the same week. Logs a JSON counts line to `console.log`. Backs the retention commitment in `privacy.html` §6. **Admin mode** (Phase 10 §D, 2026-04-26): body `{"mode":"delete_resumes_by_ids","resume_ids":[...]}` — looks up `file_path` per id, removes storage objects via `admin.storage.from("resumes").remove(paths)`, then deletes the DB rows. The sanctioned path for ad-hoc cleanups because `storage.protect_delete()` blocks raw `delete from storage.objects` SQL. See `docs/operations-runbook.md` §10.6 for the invocation pattern.

### Data model conventions (from call sites)

The DB schema isn't checked in, but call sites reveal the expected shape:

- **Reads**: frontend reads use the `jobs_full` view (joined employer + flags) — not the `jobs` base table. The base `jobs` table is written to for analytics (`view_count`), read by Edge Functions for scoring, and read/written by `employer.html` for the owning employer's listings (RLS gates by `employer_id IN (SELECT id FROM employers WHERE auth_user_id = auth.uid())`).
- **Job sources**: `jobs.source` is either `'employer'` (paid verified posting inserted via `employer.html` after Stripe fulfillment) or `'usajobs'` (pulled by `refresh-jobs` from USAJobs.gov). External-sourced rows carry `source_url` (apply link) and `source_ref` (external ID); employer-sourced rows leave both null. All `source='usajobs'` rows share a single synthetic employer (`00000000-0000-0000-0000-00000000a001`) so the existing `jobs.employer_id` NOT NULL FK holds without schema ripple. The `jobs_source_ref_key` partial unique index on `(source, source_ref) where source_ref is not null` powers idempotent daily upserts from `refresh-jobs`.
- **Auth linkage**: both `job_seekers.auth_user_id` and `employers.auth_user_id` link to the Supabase auth user. For `employers`, the link is stamped by an `auth.users` insert trigger (`on_auth_user_created_link_employer`) that matches `contact_email` case-insensitively; the `link-employer` Edge Function is the fallback for buyers who already had an `auth.users` row.
- **Resumes**: only one `resumes` row per seeker can have `is_current = true` (partial unique index `resumes_one_current_per_seeker`). The invariant is enforced at the DB layer by the `trg_resumes_flip_others` BEFORE INSERT/UPDATE trigger (see `supabase/migrations/20260425_phase9_resumes_current_trigger.sql`): when a row is inserted/updated with `is_current = true`, the trigger flips any other current row for the same seeker to false in the same transaction, so the unique-index check sees a clean state. `parse-resume` also re-asserts `is_current = true` on its own row at the end of a successful parse — that's now redundant with the trigger but harmless. Earlier code that relied on parse-resume doing the post-parse flip was broken for repeat uploads (founder hit it 2026-04-25); the trigger fixes that.
- **Matches**: `match_scores` is polymorphic via `match_type` (`'job'` is the only type currently used). `similarity` is 0–1, `score` is 0–100 — both are written. `emailed_at` gates digest sending.
- **Stripe / fulfillment**: `job_postings` is the per-purchase ledger. `create-checkout` inserts `status='pending'` rows; `stripe-webhook` flips them to `'paid'` and stamps `stripe_event_id` (defense-in-depth idempotency on top of the `stripe_webhook_events` audit table). `employer.html` is the surface where a `paid` posting becomes a `jobs` row (the dashboard inserts `jobs` then sets `job_postings.job_id`). The `employer` plan is a subscription with **unlimited active listings while `subscription_status = 'active'`** — there is no per-period counter.
- **KB**: hash routing in `kb.html` depends on `kb_articles.slug` being unique and `status = 'published'`. View counts are incremented client-side with a read-then-write (not atomic). Write access (insert/update/delete) is gated by `kb_editor_emails` allowlist via RLS — adding a new editor is a single SQL insert into that table.
- **AI skills + training (Phase 12)**: AI-era skill requirements ride on the existing `skills` + `job_skills` tables — there's no parallel `ai_skills` system. `skills.is_ai_skill = true` flags the curated AI vocabulary (10 rows seeded by `20260427_phase12_ai_skills_training_link.sql`: prompt-engineering, agent-frameworks, rag, llm-evaluation, vector-databases, ai-safety, fine-tuning, embeddings, ai-product, ai-tooling). Employer.html's listing modal surfaces a multi-select picker for these; on save it post-RPC syncs `job_skills` rows for the owning job (RLS via `job_id IN (SELECT j.id FROM jobs j JOIN employers e ON e.id = j.employer_id WHERE e.auth_user_id = auth.uid())`). `training_resources` link to skills via the `training_skills(training_id, skill_id)` link table — hand-curated by the founder via runbook §10.7 SQL. `match-jobs` includes per-job `ai_skills_required` in the prompt payload; member.html surfaces up to 3 matched training rows under each match card (sorted by recommend_count desc, view_count desc).
- **Feedback (Phase 12)**: `public.feedback` is the lightweight inbox. Anon insert via the floating widget in `/assets/site.js`; no SELECT policy = service-role only reads (founder reads via runbook §8.7). Optional Claude Haiku 4.5 stamps `claude_summary` + `claude_priority` (p0/p1/p2/p3) at submission; degrades silently when `ANTHROPIC_API_KEY` is unset.

### Edge Function environment variables

Configure these via `supabase secrets set`:

- `ANTHROPIC_API_KEY` — for `parse-resume` and `match-jobs`.
- `STRIPE_SECRET_KEY` — for `create-checkout` and `stripe-webhook`. (Plan amounts are inline in `create-checkout`; no `STRIPE_PRICE_*` env vars are used.)
- `STRIPE_WEBHOOK_SECRET` — for `stripe-webhook` signature verification.
- `RESEND_API_KEY`, `DIGEST_SECRET`, `DIGEST_FROM` (optional) — for `send-match-digest`.
- `EMAIL_FROM` (optional, defaults to `Workforce for Humans <hello@workforceforhumans.com>`) — for `stripe-webhook` confirmation emails.
- `SITE_URL` (optional) — used by `send-match-digest` and `stripe-webhook`.
- `OPENAI_API_KEY` — for `intelligence-feed` embeddings. Optional; if missing, embedding step is skipped.
- `USAJOBS_AUTH_KEY`, `USAJOBS_USER_AGENT`, `REFRESH_SECRET` — for `refresh-jobs` daily USAJobs.gov pull. `USAJOBS_USER_AGENT` must be a contactable email registered with developer.usajobs.gov; `REFRESH_SECRET` is the pre-shared value pg_cron sends in the `x-refresh-secret` header.
- `PRUNE_SECRET` — for the weekly `prune-inactive-data` retention cron. Pre-shared value pg_cron sends in the `x-prune-secret` header; must match the value seeded into Supabase Vault by the Phase 9 migration.
- `INTELLIGENCE_FEED_SECRET` — for the daily `intelligence-feed` cron (Phase 12). Pre-shared value pg_cron sends in the `x-intelligence-feed-secret` header; must match the value seeded into Supabase Vault by the Phase 12 §A1 migration.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` are auto-injected by Supabase.

### Analytics

The site has two parallel analytics paths, both free-tier, configured Phase 9 (2026-04-25):

- **Cloudflare Web Analytics** (pageviews, referrer, country, device, Web Vitals) — auto-injected at the edge by Cloudflare Pages, no snippet in the repo. CSP allows `static.cloudflareinsights.com` (script-src) + `cloudflareinsights.com` (connect-src) in `_headers`.
- **PostHog Cloud, US region** (custom events) — snippet in `/assets/site.js`. Configured tightly: `autocapture: false`, `disable_session_recording: true`, `person_profiles: 'identified_only'` to keep us comfortably under the 1M-events/mo free-tier cap. Three custom events wired: `CTA: employer-checkout-start` (in `index.html`), `Event: resume-upload` (in `resume.html`), `Event: find-matches` (in `member.html`). Project token `phc_uFTsr…` is a public client-side key (like the Supabase anon key) — embedding it in the snippet is intentional. CSP allows `us-assets.i.posthog.com` (script-src) + `us.i.posthog.com` (connect-src).

Plausible was previously wired but never configured with a real account; swapped out in PR #25 driven by founder budget pressure.

## Conventions to follow

- **Don't introduce a build step, bundler, or framework.** The HTML-per-page architecture is deliberate. Shared design tokens, nav, and footer live in `/assets/site.css` + `/assets/site.js`; per-page CSS/JS stays inline in that page.
- **Keep Edge Function style uniform**: same `corsHeaders`, same `json(body, status)` helper, same auth pattern (user client for verification → admin client for work), same defensive JSON slice for Claude output. Server-to-server functions (`stripe-webhook`, `intelligence-feed`, `create-checkout`, `refresh-jobs`, `prune-inactive-data`, `send-match-digest`, `submit-feedback`) are declared `verify_jwt = false` in `supabase/config.toml` — keep that file in sync when adding new functions of that shape. **Cron-only functions (`refresh-jobs`, `send-match-digest`, `prune-inactive-data`, `intelligence-feed`) drop CORS entirely** — no `corsHeaders` const, no `OPTIONS` handler, no `Access-Control-Allow-Origin` on responses — and gate the shared-secret header through a small inlined `timingSafeEqual(a,b)` helper (XOR-accumulate, length-checked, no short-circuit). pg_cron + pg_net don't preflight or read response CORS headers, so cron behavior is unchanged; any browser caller failing the CORS check is the goal.
- **Stripe webhook idempotency**: every event lands in `stripe_webhook_events` keyed by `stripe_event_id`. Insert-then-process; conflict short-circuits. Failed events do NOT auto-retry — fix the cause then clear the audit row to re-deliver. Don't bypass the audit table for new event handlers.
- **Model ID**: use `claude-sonnet-4-6` for new Claude calls when output quality matters (member-facing prose, structured parses). Use `claude-haiku-4-5` for binary or tightly-scoped classification calls — `refresh-jobs` switched to Haiku in Phase 10 §A for ~5× cost savings on its keep/reject filter. Keep `max_tokens` bounded (current functions use 3000–6000).
- **RLS is the source of truth for access control on browser reads and writes.** The anon key is shipped to the client intentionally; any new tables the browser touches need matching RLS policies — do not work around this by pushing reads into an Edge Function unless there's a real reason. The webhook bypasses RLS via service-role; that's the only sanctioned bypass.
- **Deploy order matters for Stripe changes**: migrations → `stripe-webhook` → `link-employer` → `intelligence-feed` → `create-checkout` → HTML. Reversing the function order can desync metadata between checkout and webhook, silently breaking fulfillment.
- **Git workflow**: feature work happens on `claude/*` branches that are merged into `master` via PR (see `git log`). Do not commit directly to `master`.
