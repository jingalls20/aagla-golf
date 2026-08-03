-- AAGLA Golf: seed the Seattle chapter as the second league.
--
-- Source: "AAGLA Data Set - Seattle Chapter"
-- (1NZEFnPGx0x_Ghs0fYKEe0OvCt-GgEJ9_-vbq4qzE4xU), exported 1 August 2026.
--
-- The Seattle chapter ran on the same Apps Script app as Iowa, so its App*
-- tabs have the identical shape and this mirrors 0004 exactly. It is a much
-- younger chapter -- founded 2025 -- and the data came through clean: no
-- duplicate names, no orphaned references, no duplicated handicap rows, and
-- none of the phantom zero-score rows that 0005 had to correct for Iowa. Every
-- recorded net score is internally consistent.
--
-- Five players appear in both chapters (Angelo Gutierrez, Anthony Dworak,
-- Josh Ingalls, Josh Ramos, Tim Paccione). They are deliberately separate
-- player rows: a player's handicap, history and standing belong to the league
-- they earned them in, and `players` is league-scoped for exactly this reason.

insert into public.leagues (slug, name, chapter, public_board)
values ('aagla-seattle', 'AAGLA Seattle Chapter', 'Seattle', true);

insert into public.seasons (league_id, year)
select l.id, y
from public.leagues l, generate_series(2025, 2026) as y
where l.slug = 'aagla-seattle';

insert into public.players (league_id, legacy_id, name, status, first_year)
select l.id, v.legacy_id, v.name, v.status::public.player_status, v.first_year
from (values (1,'Angelo Gutierrez','active',2025),(2,'Anthony Dworak','active',2025),(3,'Austin Hargarten','inactive',2025),(4,'Josh Ingalls','active',2025),(5,'Josh Ramos','active',2025),(6,'Matt Plantinga','active',2025),(7,'Tim Paccione','inactive',2025),(8,'Zander','active',2025)) as v(legacy_id, name, status, first_year)
join public.leagues l on l.slug = 'aagla-seattle';

insert into public.player_contacts (player_id, league_id, email)
select pl.id, l.id, v.email
from (values (4,'Jingalls20@gmail.com')) as v(legacy_id, email)
join public.leagues l on l.slug = 'aagla-seattle'
join public.players pl on pl.league_id = l.id and pl.legacy_id = v.legacy_id;

insert into public.events (league_id, season_id, legacy_id, sequence, event_type, name, status)
select l.id, se.id, v.legacy_id, v.legacy_id, v.event_type::public.event_type,
       v.name, v.status::public.event_status
from (values (1,2025,'event',null,'played'),(2,2025,'event',null,'played'),(3,2025,'major',null,'played'),(4,2025,'event',null,'played'),(6,2025,'major',null,'played'),(7,2025,'championship',null,'played'),(8,2026,'event','Jackson Park','played'),(9,2026,'event','Battle Creek','played'),(10,2026,'event','Harbour Pointe','played'),(11,2026,'event','Bellevue','scheduled'),(5,2025,'event',null,'played'),(12,2026,'event','2026 Wildcard Round','played'),(13,2026,'major','Willows Run (Major)','scheduled'),(14,2026,'championship','Washington National (Championship)','scheduled')) as v(legacy_id, year, event_type, name, status)
join public.leagues l on l.slug = 'aagla-seattle'
join public.seasons se on se.league_id = l.id and se.year = v.year;

insert into public.handicaps (league_id, season_id, player_id, fs, note, is_override)
select l.id, se.id, pl.id, v.fs, v.note, v.is_override
from (values (1,2026,13,'Manual override (admin)',true),(2,2026,15,'Manual override (admin)',true),(3,2026,17,'Only 5 of 2025''s round(s) available (wanted 7).',false),(4,2026,7,'Manual override (admin)',true),(5,2026,12,'Manual override (admin)',true),(6,2026,19,'Manual override (admin)',true),(7,2026,17.333333333333332,'Only 4 of 2025''s round(s) available (wanted 7).',false),(8,2026,17,'Manual override (admin)',true),(1,2025,0,'No 2024 rounds found; defaults to 0.',false),(2,2025,0,'No 2024 rounds found; defaults to 0.',false),(3,2025,0,'No 2024 rounds found; defaults to 0.',false),(4,2025,0,'No 2024 rounds found; defaults to 0.',false),(5,2025,0,'No 2024 rounds found; defaults to 0.',false),(6,2025,0,'No 2024 rounds found; defaults to 0.',false),(7,2025,0,'No 2024 rounds found; defaults to 0.',false),(8,2025,0,'No 2024 rounds found; defaults to 0.',false)) as v(player_legacy, year, fs, note, is_override)
join public.leagues l on l.slug = 'aagla-seattle'
join public.seasons se on se.league_id = l.id and se.year = v.year
join public.players pl on pl.league_id = l.id and pl.legacy_id = v.player_legacy;

insert into public.scores (league_id, event_id, player_id, legacy_id, true_score,
                           fs_applied, course_differential, net_score, place,
                           event_points, source)
select l.id, ev.id, pl.id, v.legacy_id, v.true_score, v.fs_applied,
       coalesce(v.course_differential, 0), v.net_score, v.place, v.event_points,
       v.source::public.score_source
from (values (1,1,1,16,12,0,4,4,2,'historical'),(2,2,1,15,12,0,3,3,1.5,'historical'),(3,3,1,10,12,0,-2,1,0,'historical'),(4,4,1,16,12,1,5,5,2.5,'historical'),(5,6,1,17,12,0,5,3,3,'historical'),(6,7,1,13,9,0,4,4,0,'historical'),(7,1,2,13,16,0,-3,2,1,'historical'),(8,2,2,16,16,0,0,1,0,'historical'),(9,3,2,24,16,0,8,4,4,'historical'),(10,4,2,13,15,1,-1,2,1,'historical'),(12,1,3,21,10,0,11,6,3,'historical'),(13,2,3,19,10,0,9,5,2.5,'historical'),(14,3,3,18,10,0,8,4,4,'historical'),(15,4,3,17,12,1,6,6,3,'historical'),(17,1,4,5,8,0,-3,2,1,'historical'),(18,2,4,20,8,0,12,6,3,'historical'),(19,3,4,10,8,0,2,2,2,'historical'),(20,4,4,5,8,1,-2,1,0,'historical'),(22,6,4,8,8,0,0,1,0,'historical'),(23,7,4,8,8,0,0,1,0,'historical'),(24,1,5,14,9,0,5,5,2.5,'historical'),(25,2,5,16,9,0,7,4,2,'historical'),(26,4,5,11,12,1,0,3,1.5,'historical'),(27,6,5,15,12,0,3,2,2,'historical'),(28,7,5,10,7,0,3,3,0,'historical'),(29,1,6,16,17,0,-1,3,1.5,'historical'),(30,2,6,20,17,0,3,3,1.5,'historical'),(31,3,6,30,17,0,13,5,5,'historical'),(32,4,6,17,20,2,-1,2,1,'historical'),(34,6,6,21,20,-1,0,1,0,'historical'),(35,7,6,29,18,0,11,5,0,'historical'),(36,1,7,20,21,0,-1,3,1.5,'historical'),(37,4,7,19,20,2,1,4,2,'historical'),(39,6,7,16,20,4,0,1,0,'historical'),(40,1,8,8,17,0,-9,1,0,'historical'),(41,2,8,19,17,0,2,2,1,'historical'),(42,3,8,23,17,0,6,3,3,'historical'),(43,4,8,20,15,1,6,6,3,'historical'),(45,6,8,20,15,0,5,3,3,'historical'),(46,7,8,15,14,0,1,2,0,'historical'),(47,8,1,12,13,0,-1,1,0,'historical'),(48,8,8,17,17,0,0,2,1,'historical'),(49,8,4,9,7,0,2,3,1.5,'historical'),(50,8,2,20,15,0,5,4,2,'historical'),(51,8,5,25,12,0,13,5,2.5,'historical'),(52,9,6,13,19,0,-6,1,0,'historical'),(53,9,4,5,7,0,-2,2,1,'historical'),(54,9,8,21,17,0,4,4,2,'historical'),(55,9,5,13,12,0,1,3,1.5,'historical'),(56,10,1,18,13,0,5,2,1,'new'),(57,10,2,20,15,0,5,2,1,'new'),(58,10,5,21,12,0,9,4,2,'new'),(59,10,8,17,17,0,0,1,0,'new'),(60,11,4,6,7,0,-1,1,0,'historical'),(61,5,4,10,8,0,2,3,1.5,'historical'),(62,5,2,22,15,0,7,6,3,'historical'),(63,5,3,16,12,0,4,4,2,'historical'),(64,5,6,31,20,-5,6,5,2.5,'historical'),(65,5,7,17,20,0,-3,1,0,'historical'),(66,5,8,17,15,-2,0,2,1,'historical'),(67,12,4,6,7,0,-1,1,0,'new'),(68,10,4,13,7,0,6,3,1.5,'new'),(69,10,6,null,null,0,null,5,2.5,'missed')) as v(legacy_id, event_legacy, player_legacy, true_score,
                        fs_applied, course_differential, net_score, place,
                        event_points, source)
join public.leagues l on l.slug = 'aagla-seattle'
join public.events ev on ev.league_id = l.id and ev.legacy_id = v.event_legacy
join public.players pl on pl.league_id = l.id and pl.legacy_id = v.player_legacy;
