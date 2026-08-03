-- AAGLA Golf: correct 15 phantom "did not play" rows.
--
-- The original spreadsheet recorded a non-participant as True Score = 0 rather
-- than leaving the row out. Its own net-score formula could not cope and
-- returned #NUM! or blank for every one of them, while the finishing place was
-- filled in by hand as the shared last place -- which is precisely the app's
-- "missed" semantics. The 2026 importer took those zeros at face value.
--
-- Left alone this is not cosmetic. Two things break:
--
--   1. Handicaps come out too low. The handicap formula averages a player's
--      BEST N true scores, and a phantom 0 is almost always the best number
--      in the window. Ryan Lameroux carries five of these in 2022; Bill Ice,
--      Will Ice and Josh Rudman carry them in 2024. Their locked handicaps for
--      the following season were computed from rounds they never played.
--
--   2. Any recompute of those events puts the phantoms in FIRST place, since
--      0 minus a double-digit handicap is a huge negative net, pushing every
--      real player down by one place per phantom row.
--
-- The fix converts them to what they always were: source = 'missed', with no
-- score, keeping the recorded place and points exactly as the league recorded
-- them. Ten OTHER rows also have True Score = 0 and are left untouched --
-- those are genuine even-par rounds, identifiable because their recorded net
-- score is internally consistent.

update public.scores s
set true_score = null,
    fs_applied = null,
    net_score = null,
    source = 'missed'
from (values (65,11),(65,12),(67,4),(69,4),(70,4),(71,4),(72,4),(82,11),(82,10),(83,11),(83,10),(83,25),(86,12),(86,23),(86,6)) as v(event_legacy, player_legacy)
join public.leagues l on l.slug = 'aagla-iowa'
join public.events ev on ev.league_id = l.id and ev.legacy_id = v.event_legacy
join public.players p on p.league_id = l.id and p.legacy_id = v.player_legacy
where s.event_id = ev.id and s.player_id = p.id;
