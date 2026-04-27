-- Phase 13 — Career copilot, 2026-04-28.
-- Extends match_scores so match-jobs can return a per-match coach brief
-- alongside the existing rationale + growth_note (Phase 7).
--
-- Three new prose fields, all nullable so pre-Phase-13 rows render
-- cleanly under the same member.html disclosure (graceful degrade —
-- the UI hides any sub-section whose field is null).
--
--   resume_tailoring:    "tailor your resume for this role" — concrete
--                        edits the seeker should make to the bullets they
--                        already have so this specific posting reads
--                        them clearly.
--   skill_gap_plan:      structured "you have X, role wants Y, start with
--                        Z" — the next-edge framing from growth_note,
--                        spelled out as an ordered learning path rather
--                        than a single sentence. Never "you lack" / "you
--                        are missing" — same coach voice as growth_note.
--   application_strategy: per-match application advice — what angle to
--                        lead with in the cover letter / outreach, what
--                        recruiters typically screen for in this kind of
--                        role, what NOT to over-emphasize.
--
-- match_scores RLS already gates on job_seeker_id (Phase 7); new columns
-- inherit those policies. No RLS changes needed.
--
-- Idempotent.

alter table public.match_scores
  add column if not exists resume_tailoring     text,
  add column if not exists skill_gap_plan       text,
  add column if not exists application_strategy text;
