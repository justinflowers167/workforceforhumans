-- Phase 7: Claude-authored growth edge per match, surfaced under each match card on member.html.
-- Additive, idempotent. RLS policy on match_scores is table-level (no column grants) so the
-- owning seeker automatically reads this column via the existing policy.

alter table public.match_scores add column if not exists growth_note text;

comment on column public.match_scores.growth_note is
  'Claude-authored 1-2 sentence framing of the candidate''s next growth edge for this match. Nullable for backward compatibility with rows scored pre-Phase 7.';
