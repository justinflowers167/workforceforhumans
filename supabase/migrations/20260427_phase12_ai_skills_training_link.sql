-- Phase 12 — Feature depth, 2026-04-27.
-- Closes the employer → AI skills → training loop the platform was
-- missing. Three changes:
--
--   1. Tag a subset of `skills` rows as AI-era skills (drives the
--      employer-side picker). `description` provides the tooltip.
--   2. Add a many-to-many `training_skills` link table so a training
--      resource can be tagged with multiple skill ids — the seam
--      member.html uses to surface "Recommended training to grow into
--      this role" under each match.
--   3. Add INSERT/DELETE policies on `job_skills` for the owning
--      employer (currently only SELECT is public; the table exists but
--      browsers couldn't write to it). Without these, the new picker
--      in employer.html would silently fail RLS.
--
-- Idempotent. The seed uses `on conflict (slug) do update` so re-running
-- this migration only forces the is_ai_skill / description re-assertion;
-- it never duplicates rows.

-- 1a. Extend skills.
alter table public.skills
  add column if not exists is_ai_skill boolean default false,
  add column if not exists description text;

create index if not exists skills_is_ai_skill_idx on public.skills (is_ai_skill) where is_ai_skill = true;

-- 1b. Seed the starter AI-skills list. Controlled vocabulary that drives
-- the employer.html multi-select. Add more rows over time as real
-- postings arrive.
insert into public.skills (name, slug, is_ai_skill, description) values
  ('Prompt engineering','prompt-engineering',true,'Designing prompts that elicit reliable outputs from LLMs.'),
  ('Agent frameworks','agent-frameworks',true,'LangChain, CrewAI, AutoGen, Anthropic Agent SDK, etc.'),
  ('RAG (retrieval-augmented generation)','rag',true,'Combining LLMs with external knowledge bases.'),
  ('LLM evaluation','llm-evaluation',true,'Measuring model output quality — accuracy, hallucination, bias.'),
  ('Vector databases','vector-databases',true,'Pinecone, Weaviate, pgvector — embedding storage and retrieval.'),
  ('AI safety + policy','ai-safety',true,'Responsible deployment, red-teaming, governance.'),
  ('Fine-tuning','fine-tuning',true,'Adapting foundation models to domain-specific data.'),
  ('Embeddings','embeddings',true,'Generating and using vector representations of text/images.'),
  ('AI product management','ai-product',true,'Shipping AI features end-to-end with eval-driven development.'),
  ('AI tooling fluency','ai-tooling',true,'Day-to-day use of Claude, ChatGPT, Cursor, Copilot in workflow.')
on conflict (slug) do update
  set is_ai_skill = excluded.is_ai_skill,
      description = excluded.description,
      name        = excluded.name;

-- 2. Many-to-many: training_resources ↔ skills.
create table if not exists public.training_skills (
  training_id uuid    not null references public.training_resources(id) on delete cascade,
  skill_id    integer not null references public.skills(id) on delete cascade,
  primary key (training_id, skill_id)
);
create index if not exists training_skills_skill_id_idx on public.training_skills (skill_id);

alter table public.training_skills enable row level security;

drop policy if exists "Public can view training skills" on public.training_skills;
create policy "Public can view training skills" on public.training_skills
  for select to public using (true);

-- Founder seeds the mapping by hand via SQL editor (curated, low volume).
-- No anon write policy intentionally — runbook §10.7 documents the
-- INSERT pattern.

-- 3. job_skills write policies for the employer-side picker.
-- The owning employer (auth_user_id linked to employers row) can
-- insert/delete rows scoped to their own jobs. Phase 10 §C wrapped
-- auth.uid() in (select …) for query-cache reuse — keep that pattern.

drop policy if exists "Employer owner can insert own job skills" on public.job_skills;
create policy "Employer owner can insert own job skills" on public.job_skills
  for insert to authenticated
  with check (
    job_id in (
      select j.id
      from public.jobs j
      join public.employers e on e.id = j.employer_id
      where e.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "Employer owner can delete own job skills" on public.job_skills;
create policy "Employer owner can delete own job skills" on public.job_skills
  for delete to authenticated
  using (
    job_id in (
      select j.id
      from public.jobs j
      join public.employers e on e.id = j.employer_id
      where e.auth_user_id = (select auth.uid())
    )
  );
