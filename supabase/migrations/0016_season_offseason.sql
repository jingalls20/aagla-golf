-- Offseason mode: the stretch after a season's last card is in and before
-- the next season's schedule exists.
--
-- It is deliberately its own flag rather than something the app infers. The
-- obvious inference -- "every event has a score, so the season is over" --
-- is wrong in both directions: a season can have its last event cancelled
-- and be finished early, and an admin can be part-way through entering the
-- final card with every other event complete. More to the point, the far
-- end of the offseason is a judgement no data can express, because "the next
-- schedule is out" is a fact about a group chat, not about this database.
--
-- It sits beside `is_current` rather than replacing it. The season stays
-- current through the offseason -- it is still the one the app opens on --
-- but it now reads as a recap rather than a race, and the handicaps screen
-- turns to face next year. Creating and making current a new season is what
-- ends the offseason, and clearing the flag by hand does too.
--
-- Unlike `is_current` there is no partial unique index here. Two seasons
-- flagged at once would be odd but harmless, and the alternative -- a
-- constraint that fights the admin mid-rollover -- is worse than the
-- untidiness it prevents.

alter table public.seasons
  add column is_offseason boolean not null default false;

comment on column public.seasons.is_offseason is
  'Season is over but next season''s schedule is not out yet: show it as a recap, and point handicaps at next year.';
