-- Move the 2026 course names out of `name` and into `course`.
--
-- `events.course` has existed since the core schema and has never held a
-- single value. Meanwhile the 2026 season's events were named after the
-- courses they were played at -- "Grandview", "Jackson Park" -- so the
-- information was in the database all along, just in the wrong column,
-- where nothing could group or compare by it.
--
-- Only 2026 is affected. The 100 events from 2013-2025 carry no name and no
-- course, and that history is gone; course is recorded going forward from
-- here rather than reconstructed backwards from memory.
--
-- `name` is deliberately left alone rather than cleared. It is what the
-- records board and the handicap screen print when they cite where a round
-- happened, and blanking it would turn "Bellevue, 2026" into "event #11".
-- The two columns say different things: name is what the day was called,
-- course is where it was played. They coincide this season by accident.

update public.events e
set course = btrim(regexp_replace(e.name, '\s*\((Major|Championship)\)\s*$', ''))
where e.course is null
  and btrim(coalesce(e.name, '')) <> ''
  -- The suffixes exist because Seattle disambiguated its two title events by
  -- hand: "Willows Run (Major)". The course is Willows Run; the fact that it
  -- was a Major already lives in event_type.
  and e.id in (
    select ev.id
    from public.events ev
    join public.seasons s on s.id = ev.season_id
    where s.year = 2026
  )
  -- Not every named event names a course. Seattle's wildcard round is a
  -- format, not a venue, and guessing one would be worse than leaving it
  -- empty -- an absent course reads as "not recorded", a wrong one reads as
  -- fact. It can be filled in by hand if that round did have a home.
  and e.name <> '2026 Wildcard Round';
