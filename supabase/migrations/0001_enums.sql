-- AAGLA Golf: enum types.
--
-- These replace the free-text string columns the Apps Script version kept in
-- the sheet ('Event' / 'Major' / 'Championship', 'Active' / 'Inactive',
-- 'Historical' / 'New' / 'Missed'). Making them real types means a typo is a
-- database error rather than a row that silently stops matching a filter.

create type public.event_type as enum ('event', 'major', 'championship');
create type public.event_status as enum ('scheduled', 'played', 'cancelled');
create type public.player_status as enum ('active', 'inactive');
create type public.member_role as enum ('owner', 'admin', 'member');

-- 'historical' rows are imported from the pre-app spreadsheet and their
-- recorded place/points are trusted as-is, never recomputed. 'missed' rows are
-- the synthetic last-place entries created for players who did not post a
-- score once enough of the field had played.
create type public.score_source as enum ('historical', 'new', 'missed');
