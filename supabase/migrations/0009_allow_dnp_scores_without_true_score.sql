-- 'dnp' rows, like 'missed' rows, record a finishing place and points penalty
-- without a round having been played, so true_score stays null for them too.
-- Split into its own migration because a just-added enum value cannot be
-- referenced in the same transaction that added it.
alter table public.scores
  drop constraint scores_played_rounds_have_a_score;

alter table public.scores
  add constraint scores_played_rounds_have_a_score
    check (source in ('missed', 'dnp') or true_score is not null);
