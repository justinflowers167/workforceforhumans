-- 2026-08-02 — Working view counters via a narrow increment RPC
--
-- PROBLEM: jobs.view_count is 0 across all 2,757 rows and
-- kb_articles.view_count is 0 across all 18 articles. The client-side
-- increments in jobs.html and kb.html have never landed:
--   * kb_articles has exactly one UPDATE policy, scoped to `authenticated`
--     and gated on the kb_editor_emails allowlist.
--   * jobs has no UPDATE policy reachable by anon at all.
-- Both call sites are fire-and-forget (no await, no error check), so RLS
-- rejected them silently since launch. Two consequences: every KB card
-- renders "0 views" to real visitors, and the site has no server-side
-- traffic signal to triangulate PostHog against.
--
-- WHY AN RPC AND NOT AN RLS POLICY: a policy permissive enough to let anon
-- bump view_count would let anon write *any* column on that row. The whole
-- point is to expose exactly one operation.
--
-- SECURITY POSTURE — read this before adding anything like it. On the same
-- day this shipped we revoked anon EXECUTE on upsert_usajobs, which was
-- SECURITY DEFINER and let anyone inject job rows. These two functions are
-- deliberately the opposite shape, and the difference is the point:
--   * No attacker-controlled DATA. The only input is a row id.
--   * No row creation, no deletion. UPDATE only, and only if the id exists.
--   * Exactly one column touched, and only ever `+ 1`. The caller cannot
--     set it, reset it, or decrement it.
--   * Scoped by a WHERE clause the caller cannot widen. kb_articles is
--     further limited to status='published' so unpublished drafts can't be
--     probed for existence.
--   * Returns void — no data leaks back through the return value.
-- Worst case is an inflated counter on a real row, which is the same thing
-- a page-refresh loop already achieves. Logged as a sanctioned exception in
-- runbook §8.10 so the next audit doesn't flag it as a repeat of the
-- upsert_usajobs finding.
--
-- Also fixes the non-atomic read-then-write that CLAUDE.md flags: the old
-- client code read view_count, added one, and wrote it back, so concurrent
-- readers clobbered each other. `set view_count = view_count + 1` is a
-- single atomic statement.

create or replace function public.bump_job_view(p_job_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.jobs
     set view_count = coalesce(view_count, 0) + 1
   where id = p_job_id
     and status = 'active';
$$;

create or replace function public.bump_kb_article_view(p_article_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.kb_articles
     set view_count = coalesce(view_count, 0) + 1
   where id = p_article_id
     and status = 'published';
$$;

-- Default grants go to PUBLIC, which is exactly the trap that produced the
-- upsert_usajobs hole. Revoke first, then grant deliberately and narrowly.
revoke all on function public.bump_job_view(uuid) from public;
revoke all on function public.bump_kb_article_view(uuid) from public;

grant execute on function public.bump_job_view(uuid) to anon, authenticated, service_role;
grant execute on function public.bump_kb_article_view(uuid) to anon, authenticated, service_role;

comment on function public.bump_job_view(uuid) is
  'Atomically increments jobs.view_count for one active job. Deliberately anon-callable: no attacker-controlled data, one column, +1 only. See runbook 8.10.';
comment on function public.bump_kb_article_view(uuid) is
  'Atomically increments kb_articles.view_count for one published article. Deliberately anon-callable: no attacker-controlled data, one column, +1 only. See runbook 8.10.';
