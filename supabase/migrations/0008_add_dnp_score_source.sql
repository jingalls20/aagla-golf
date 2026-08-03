-- A player explicitly marked "did not play" by an admin, distinct from
-- 'missed' (the automatic no-show placeholder the recompute engine writes
-- once half the roster has posted a score). DNP is admin-asserted and never
-- auto-cleared; 'missed' is system-asserted and cleared the moment it's no
-- longer earned. Both share the same scoring treatment: last place, that
-- place's points, no effect on handicap.
alter type public.score_source add value 'dnp';
