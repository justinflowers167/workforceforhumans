-- Phase 9 hotfix (2026-04-25): enforce "one current resume per seeker"
-- via BEFORE INSERT/UPDATE trigger so resume.html's INSERT with
-- is_current=true succeeds when the seeker already has a current resume.
--
-- Background: the partial unique index resumes_one_current_per_seeker
-- (job_seeker_id) WHERE is_current was tripping every repeat upload. The
-- documented intent in CLAUDE.md ("parse-resume flips others to false
-- after parse") couldn't satisfy the constraint because parse-resume runs
-- AFTER the INSERT — by then the constraint already failed. Founder hit
-- this in real testing on 2026-04-25.
--
-- The trigger fixes this at the DB layer: before any INSERT/UPDATE that
-- sets is_current=true, flip any other current row for the same seeker
-- to false. The unique-index check then sees a clean state (only the
-- new/promoted row has is_current=true) and the operation proceeds.
--
-- Security definer is required because the cross-row update would
-- otherwise be blocked by RLS in a user-session context. Scope of
-- privilege escalation is bounded: the function only touches
-- public.resumes rows for the same job_seeker_id as the row being
-- inserted/updated. search_path is pinned per Supabase advisor guidance.

create or replace function public.flip_other_current_resumes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_current then
    update public.resumes
       set is_current = false,
           updated_at = now()
     where job_seeker_id = new.job_seeker_id
       and id is distinct from new.id
       and is_current;
  end if;
  return new;
end;
$$;

-- Lock execution down — only the trigger should call this function.
revoke all on function public.flip_other_current_resumes() from public;

drop trigger if exists trg_resumes_flip_others on public.resumes;

create trigger trg_resumes_flip_others
before insert or update of is_current on public.resumes
for each row
when (new.is_current)
execute function public.flip_other_current_resumes();
