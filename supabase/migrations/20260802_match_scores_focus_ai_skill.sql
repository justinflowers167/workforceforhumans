-- 2026-08-02 — Per-match focus AI skill, so the training panel has an anchor.
--
-- The Phase 12 training panel keyed off job_skills: the AI skills a job
-- REQUIRES. Measured 2026-08-02, that substrate does not exist — job_skills
-- has 0 rows, and of 2,757 active jobs only 5 mention AI at all, with zero
-- mentioning prompt engineering, LLMs, RAG, or embeddings. The feed is
-- federal analyst and administrative roles, so a tagger would correctly tag
-- almost nothing and the panel would stay empty.
--
-- Re-keying to the seeker's gap instead of the job's stated requirement is
-- also the more faithful reading of the product thesis: "we coach you to use
-- AI so you become the candidate employers want" is a claim about roles that
-- DON'T list AI skills yet. match-jobs' system prompt already instructs the
-- model to name the single most-leveraged AI skill in growth_note and
-- skill_gap_plan; this column just captures that choice in structured form
-- so member.html can look up training for it.
--
-- Nullable: pre-existing rows and any match where the model declines to name
-- a skill render exactly as they do today.

alter table public.match_scores
  add column if not exists focus_ai_skill text;

comment on column public.match_scores.focus_ai_skill is
  'Slug of the single AI skill (from skills where is_ai_skill) the coach brief tells this seeker to learn first for this match. Drives the training panel in member.html. Nullable.';
