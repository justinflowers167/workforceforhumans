-- Phase 10 §C — wrap auth.<func>() calls in RLS policies with (select ...)
-- so Postgres evaluates them once per query rather than once per row.
--
-- Background: Supabase's auth.uid() / auth.jwt() / auth.role() / auth.email()
-- are STABLE functions but Postgres's RLS planner re-evaluates them for
-- every row inspected. The recommended fix per Supabase performance docs
-- is to wrap them in a scalar subquery, which the planner caches:
--   auth.uid()              →  (select auth.uid())
--   auth.role()             →  (select auth.role())
--   auth.jwt()              →  (select auth.jwt())
--   auth.email()            →  (select auth.email())
--
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Closes 17 auth_rls_initplan WARN findings from the 2026-04-25 advisor sweep.
--
-- Behavior is identical to before — pure perf rewrite, zero policy logic
-- changes. Each policy is dropped + recreated within a single transaction
-- (Supabase MCP apply_migration runs in one tx) so there is no window
-- where the table is RLS-uncovered.
--
-- Tables / policies covered (17 total, alphabetical by table):
--   applications.Job seekers own applications              (SELECT)
--   assessment_submissions.Users can view own assessments  (SELECT)
--   employers.Employer owner can update self               (UPDATE)
--   job_alerts.Job seekers can delete own alerts           (DELETE)
--   job_alerts.Job seekers can view own alerts             (SELECT)
--   job_postings.Employers can view own job postings       (SELECT)
--   job_seeker_skills.jss_self_rw                          (ALL)
--   job_seekers.Job seekers own profile                    (ALL)
--   jobs.Employer owner can read own jobs                  (SELECT)
--   kb_articles.KB editors can delete                      (DELETE)
--   kb_articles.KB editors can insert                      (INSERT)
--   kb_articles.KB editors can update                      (UPDATE)
--   leads.Service role can read leads                      (SELECT)
--   match_scores.Job seekers own match scores              (SELECT)
--   recruiter_contact_views.rcv_employer_read              (SELECT)
--   resumes.resumes_self_rw                                (ALL)
--   saved_jobs.Own saved jobs                              (ALL)

-- 1. applications
drop policy if exists "Job seekers own applications" on public.applications;
create policy "Job seekers own applications" on public.applications
  for select to public
  using (
    job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    )
  );

-- 2. assessment_submissions
drop policy if exists "Users can view own assessments" on public.assessment_submissions;
create policy "Users can view own assessments" on public.assessment_submissions
  for select to public
  using (
    (job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    ))
    or ((select auth.role()) = 'service_role'::text)
  );

-- 3. employers
drop policy if exists "Employer owner can update self" on public.employers;
create policy "Employer owner can update self" on public.employers
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- 4. job_alerts (DELETE)
drop policy if exists "Job seekers can delete own alerts" on public.job_alerts;
create policy "Job seekers can delete own alerts" on public.job_alerts
  for delete to public
  using (
    job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    )
  );

-- 5. job_alerts (SELECT)
drop policy if exists "Job seekers can view own alerts" on public.job_alerts;
create policy "Job seekers can view own alerts" on public.job_alerts
  for select to public
  using (
    job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    )
  );

-- 6. job_postings
drop policy if exists "Employers can view own job postings" on public.job_postings;
create policy "Employers can view own job postings" on public.job_postings
  for select to public
  using (
    employer_id in (
      select employers.id
      from public.employers
      where employers.contact_email = (
        (select users.email from auth.users where users.id = (select auth.uid()))
      )::text
    )
  );

-- 7. job_seeker_skills (ALL)
drop policy if exists "jss_self_rw" on public.job_seeker_skills;
create policy "jss_self_rw" on public.job_seeker_skills
  for all to public
  using (
    exists (
      select 1
      from public.job_seekers js
      where js.id = job_seeker_skills.job_seeker_id
        and js.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.job_seekers js
      where js.id = job_seeker_skills.job_seeker_id
        and js.auth_user_id = (select auth.uid())
    )
  );

-- 8. job_seekers (ALL)
drop policy if exists "Job seekers own profile" on public.job_seekers;
create policy "Job seekers own profile" on public.job_seekers
  for all to public
  using ((select auth.uid()) = auth_user_id);

-- 9. jobs (employer-owner SELECT)
drop policy if exists "Employer owner can read own jobs" on public.jobs;
create policy "Employer owner can read own jobs" on public.jobs
  for select to authenticated
  using (
    employer_id in (
      select employers.id
      from public.employers
      where employers.auth_user_id = (select auth.uid())
    )
  );

-- 10. kb_articles (DELETE)
drop policy if exists "KB editors can delete" on public.kb_articles;
create policy "KB editors can delete" on public.kb_articles
  for delete to authenticated
  using (
    lower(((select auth.jwt()) ->> 'email'::text)) in (
      select lower(kb_editor_emails.email) as lower
      from public.kb_editor_emails
    )
  );

-- 11. kb_articles (INSERT)
drop policy if exists "KB editors can insert" on public.kb_articles;
create policy "KB editors can insert" on public.kb_articles
  for insert to authenticated
  with check (
    lower(((select auth.jwt()) ->> 'email'::text)) in (
      select lower(kb_editor_emails.email) as lower
      from public.kb_editor_emails
    )
  );

-- 12. kb_articles (UPDATE)
drop policy if exists "KB editors can update" on public.kb_articles;
create policy "KB editors can update" on public.kb_articles
  for update to authenticated
  using (
    lower(((select auth.jwt()) ->> 'email'::text)) in (
      select lower(kb_editor_emails.email) as lower
      from public.kb_editor_emails
    )
  )
  with check (
    lower(((select auth.jwt()) ->> 'email'::text)) in (
      select lower(kb_editor_emails.email) as lower
      from public.kb_editor_emails
    )
  );

-- 13. leads (service-role SELECT)
drop policy if exists "Service role can read leads" on public.leads;
create policy "Service role can read leads" on public.leads
  for select to public
  using ((select auth.role()) = 'service_role'::text);

-- 14. match_scores
drop policy if exists "Job seekers own match scores" on public.match_scores;
create policy "Job seekers own match scores" on public.match_scores
  for select to public
  using (
    job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    )
  );

-- 15. recruiter_contact_views
drop policy if exists "rcv_employer_read" on public.recruiter_contact_views;
create policy "rcv_employer_read" on public.recruiter_contact_views
  for select to public
  using (
    exists (
      select 1
      from public.employers e
      where e.id = recruiter_contact_views.employer_id
        and e.contact_email = (select auth.email())
    )
  );

-- 16. resumes (ALL)
drop policy if exists "resumes_self_rw" on public.resumes;
create policy "resumes_self_rw" on public.resumes
  for all to public
  using (
    exists (
      select 1
      from public.job_seekers js
      where js.id = resumes.job_seeker_id
        and js.auth_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.job_seekers js
      where js.id = resumes.job_seeker_id
        and js.auth_user_id = (select auth.uid())
    )
  );

-- 17. saved_jobs (ALL)
drop policy if exists "Own saved jobs" on public.saved_jobs;
create policy "Own saved jobs" on public.saved_jobs
  for all to public
  using (
    job_seeker_id in (
      select job_seekers.id
      from public.job_seekers
      where job_seekers.auth_user_id = (select auth.uid())
    )
  );
