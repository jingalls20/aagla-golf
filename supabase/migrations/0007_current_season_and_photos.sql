-- AAGLA Golf: mark which season is current, and make room for player photos.
--
-- Two additions driven by how the app is actually used.
--
-- `seasons.is_current` -- the app previously assumed "current season" meant
-- "highest year", which is wrong twice over: a league can create next year's
-- season early while this year is still being played, and an admin needs to be
-- able to say which one the app should open on. The partial unique index makes
-- "exactly one current season per league" a database guarantee rather than
-- something the admin screen has to remember to enforce.
--
-- `players.photo_url` -- nullable, and nothing writes to it yet. The UI already
-- renders an initials avatar in every place a photo will eventually go, so
-- adding real photos later is an upload screen rather than a layout change.

alter table public.seasons
  add column is_current boolean not null default false;

create unique index seasons_one_current_per_league
  on public.seasons (league_id)
  where is_current;

-- Backfill: the most recent season of each league becomes the current one.
update public.seasons s
set is_current = true
where s.year = (
  select max(s2.year) from public.seasons s2 where s2.league_id = s.league_id
);

alter table public.players
  add column photo_url text
    check (photo_url is null or photo_url ~ '^https?://');
