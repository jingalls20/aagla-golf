-- Backfill the missing DNP rows for Seattle's 2025 season.
--
-- The season was imported from the old spreadsheet, which only ever recorded
-- rounds that were actually played. Ten (player, event) pairs across the
-- seven events therefore had no row at all -- not a DNP, simply nothing --
-- and since season points accumulate and lower wins, every event a player
-- missed was worth exactly zero to them. Skipping a Sunday was free.
--
-- It distorted the season badly. Tim Paccione topped the 2025 points table on
-- 3.5 having played four of the seven events, ahead of players who turned up
-- for all of them and paid for every round. The three men with a full seven
-- finished 2nd, 5th and 6th.
--
-- The places and points below are not hand-arithmetic. They were produced by
-- running the same `recomputeEventResults` the app uses, over this season's
-- stored rows, and that run also reproduced all 46 existing places and points
-- exactly -- which is what makes the ten new ones trustworthy. The rule it
-- applies: everyone missing shares one place, worse than the worst actual
-- score that day, and takes that place's points. A Championship is worth zero
-- season points to anybody, so the three Championship DNPs carry 0.
--
-- Nothing else moves. Handicaps skip rows with no `true_score`
-- (lib/data/queries.ts), the record book counts only `isPlayed` rounds, the
-- world ranking filters on a gross score, and the Hall's field size counts
-- players who posted a score -- so it stays at eight. What does change is the
-- 2025 standings, and with them the Hall blurb, which regenerates itself:
-- Josh Ingalls took the Championship and now the points too, so 2025 reads as
-- a double.
--
--   before                      after
--   1. Tim Paccione      3.5    1. Josh Ingalls      7.5
--   2. Josh Ingalls      7.5    2. Zander           11
--   3. Josh Ramos        8      3. Matt Plantinga   11.5
--   4. Angelo Gutierrez  9      4. Angelo Gutierrez 12.5
--   5. Anthony Dworak    9      5. Anthony Dworak   13
--   6. Zander           11      6. Tim Paccione     13
--   7. Matt Plantinga   11.5    7. Josh Ramos       17.5
--   8. Austin Hargarten 14.5    8. Austin Hargarten 18.5
--
-- Scoped to this one season on purpose. Iowa has ten seasons with the same
-- gap, but its rosters changed year to year, so a DNP there has to be scoped
-- to the years each player was actually a member -- a separate job, and a
-- more delicate one. Seattle 2025 is safe because all eight played at least
-- four of the seven events, so nobody here joined or left mid-season.
--
-- Idempotent: the not-exists guard means re-running inserts nothing.

insert into public.scores (
  league_id, event_id, player_id,
  true_score, fs_applied, course_differential, net_score,
  place, event_points, source
)
select e.league_id, e.id, v.player_id, null, null, 0, null, v.place, v.points, 'dnp'
from (values
  ('9a59cfbc-f50a-4543-be43-e48ddfe97e72'::uuid, 'd75299d6-ce48-4a3c-b2f3-2eb89f0ae7b0'::uuid, 7, 3.5),
  ('148a2191-ccfc-4756-bdca-d74028d70397'::uuid, '4ca425aa-f171-4fd2-bddc-c7d92dca4662'::uuid, 6, 6),
  ('148a2191-ccfc-4756-bdca-d74028d70397'::uuid, 'd75299d6-ce48-4a3c-b2f3-2eb89f0ae7b0'::uuid, 6, 6),
  ('a7e7bbcb-08e6-4221-9678-d5848584b7c4'::uuid, '8016c96a-4ffd-4d28-837a-e90a62c03c2c'::uuid, 7, 3.5),
  ('a7e7bbcb-08e6-4221-9678-d5848584b7c4'::uuid, '4ca425aa-f171-4fd2-bddc-c7d92dca4662'::uuid, 7, 3.5),
  ('bc38bdef-ec13-4362-bafb-0a624baf802a'::uuid, 'f103055d-1dc1-4401-bea1-ef04b0ca0f92'::uuid, 4, 4),
  ('bc38bdef-ec13-4362-bafb-0a624baf802a'::uuid, '34cc278c-fc2c-4eec-a1a1-ebaa09087ae2'::uuid, 4, 4),
  ('35107929-4c2e-496c-b429-ece769dc0e50'::uuid, 'f103055d-1dc1-4401-bea1-ef04b0ca0f92'::uuid, 6, 0),
  ('35107929-4c2e-496c-b429-ece769dc0e50'::uuid, '34cc278c-fc2c-4eec-a1a1-ebaa09087ae2'::uuid, 6, 0),
  ('35107929-4c2e-496c-b429-ece769dc0e50'::uuid, 'd75299d6-ce48-4a3c-b2f3-2eb89f0ae7b0'::uuid, 6, 0)
) as v(event_id, player_id, place, points)
join public.events e on e.id = v.event_id
where not exists (
  select 1 from public.scores s
  where s.event_id = v.event_id and s.player_id = v.player_id
);
