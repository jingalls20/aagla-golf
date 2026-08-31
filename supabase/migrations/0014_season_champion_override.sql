-- Name the Championship winner outright.
--
-- The Championship is decided on the day, and the day does not always end
-- in a scoreline. Iowa 2026 finished with Taylor Musselman and London Usher
-- both on -1; they played off, Taylor won, and nothing about that appears
-- in the scores -- a playoff changes who lifts the trophy, not what anybody
-- shot. The stored result is a genuine tie, and no amount of arithmetic
-- over it will ever produce one winner.
--
-- So the winner can simply be recorded. Null means "read it off the
-- scores", which is the default and how every other season already works;
-- setting it says an admin has decided this one, whatever the card says.
--
-- Deliberately a player rather than a free-text name: it has to point at
-- somebody the app can link to, count a title for, and show a face beside.
-- ON DELETE SET NULL so removing a player falls back to the scores rather
-- than leaving a season pointing at nothing.

alter table public.seasons
  add column if not exists champion_player_id uuid
  references public.players(id) on delete set null;

comment on column public.seasons.champion_player_id is
  'Championship winner for this season, set by an admin where the scores '
  'cannot say -- a playoff after a tie, most often. Null means derive the '
  'winner from the recorded places. See lib/domain/hall.ts.';

create index if not exists seasons_champion_player_id_idx
  on public.seasons (champion_player_id)
  where champion_player_id is not null;
