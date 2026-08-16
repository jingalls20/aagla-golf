-- Seattle's drop-your-worst rule, from 2026.
--
-- Every Seattle player discards their worst finish of the year. Iowa has no
-- such rule, so this cannot be a constant in the scoring code -- it is a
-- property of a season, and it belongs beside the other season rules
-- (handicap_best_of, handicap_window_events, points_table) rather than in a
-- chapter-specific branch somewhere in the app.
--
-- Stored as a count rather than a flag so "drop your two worst" is a number
-- in a form later, not another migration. 0 means the rule is off, which is
-- the default and therefore Iowa's behaviour, unchanged.

alter table public.seasons
  add column if not exists drop_worst_count smallint not null default 0;

alter table public.seasons
  drop constraint if exists seasons_drop_worst_count_sane;
alter table public.seasons
  add constraint seasons_drop_worst_count_sane
  check (drop_worst_count >= 0 and drop_worst_count <= 4);

comment on column public.seasons.drop_worst_count is
  'How many of a player''s worst scoring results this season discards. '
  '0 disables the rule. Majors are never candidates, and a player is never '
  'left without a counting result -- see lib/domain/standings.ts.';

-- On for Seattle from 2026, the season the rule was introduced. Deliberately
-- not retroactive: 2025 was played and settled under the old arithmetic, and
-- restating a finished season's standings afterwards would be rewriting
-- history rather than recording a rule. Scoped by year rather than by
-- "current" so it stays correct once 2027 exists.
update public.seasons s
set drop_worst_count = 1
from public.leagues l
where l.id = s.league_id
  and l.chapter = 'Seattle'
  and s.year >= 2026
  and s.drop_worst_count = 0;
