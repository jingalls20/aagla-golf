# The league's rules

Every rule the app enforces, written down. Until now these existed only as
comments inside a Google Apps Script file and in the heads of the people who
run the league.

The authoritative implementation is `lib/domain/`, and every rule below has a
test in the matching `*.test.ts`. If this document and the code ever disagree,
the tests are what actually governs — but please fix whichever one is wrong.

## Scores

A round is recorded as a **true score**: strokes relative to par, so `-2` is two
under and `14` is fourteen over.

Each player plays off a **handicap**, called *free strokes* or *FS* in this
league. A **course differential** adjusts for a course being harder or easier
than usual. The three combine into a **net score**:

```
net = floor(true score − handicap) + course differential
```

The order matters. The floor applies to the handicap-adjusted score *before* the
differential is added, not to the whole expression. On a differential of −0.5 the
two readings differ by half a stroke, and fourteen years of recorded history
were computed the first way.

## Placing a field

Players are ranked on net score, lowest first, using **dense ranking**: ties
share a place, and the next distinct score takes the next place rather than
skipping. Nets of 70, 72, 72, 74 place 1st, 2nd, 2nd, 3rd — not 1st, 2nd, 2nd,
4th.

## Points

**Lower is better.** Winning an event scores zero points, and the season is won
by whoever accumulates the fewest.

| Place | Event | Major |
|---|---|---|
| 1st | 0 | 0 |
| 2nd | 1 | 2 |
| 3rd | 1.5 | 3 |
| 4th | 2 | 4 |
| 5th | 2.5 | 5 |
| 6th | 3 | 6 |
| 7th | 3.5 | 7 |
| 8th | 4 | 8 |
| 9th | 4.5 | 9 |
| 10th | 5 | 10 |

Majors are worth roughly double an ordinary event.

Anything worse than 10th costs the same as 10th. Finishing 14th in a field of 20
costs exactly what finishing 10th costs, so one bad day in a big field can't
bury a season.

**Championships are worth zero points at any place.** The Championship decides
its own winner and does not move the season standings.

These numbers live in `seasons.points_table`, per season. Changing them for a
future year does not touch a past one.

## Not showing up

A player who doesn't post a score is eventually treated as having played and
finished last — but only once **at least half the active roster** has recorded
a score. Below that threshold the event is still in progress and no-shows aren't
penalised yet; otherwise the first person to enter a score would instantly
saddle everyone else with a last-place finish.

Once the threshold is met, **everyone missing shares one place**, one worse than
the worst actual score, and all take the points that place is worth. They are
not ranked against each other.

If the event later drops back below the threshold — a score is deleted, or the
roster grows — those placeholder rows are removed again. The penalty only exists
while it's earned.

## Handicaps

A handicap is **locked for the whole season** and computed from the season
before it:

> Take the player's most recent **7** Event or Major rounds from last season,
> keep the **best 3**, and average their true scores.

Most-recent-first narrows it to current form; best-of-3 then discards the
blow-up rounds, so one disastrous afternoon doesn't inflate a handicap for a
whole year. Championship rounds are excluded, because they're played off a
*reduced* handicap and feeding them back in would compound the reduction year
over year.

`7` and `3` live in `seasons.handicap_window_events` and
`seasons.handicap_best_of`, per season.

A player with fewer than 7 rounds uses what they have, and the app says so. A
player with no history at all gets 0 — the correct neutral default, meaning "no
strokes given", though it's indistinguishable from a genuinely scratch player,
which is why admins can override.

**Handicaps can be negative.** The best players in this league give strokes back
rather than receive them.

An admin can override any handicap. An override is flagged as such and is never
silently replaced by the automatic calculation.

## The Championship's staggered start

In the Championship, the season leader plays their full handicap. Rank 2 gives
up one stroke, rank 3 gives up two, and so on:

```
championship handicap = max(0, locked handicap − (season rank − 1))
```

The season's best players start the final event at a disadvantage proportional
to how well they played all year, which keeps it live for the whole field. A
player with no season standing takes no reduction, and the result never drops
below zero.

## Season standings

A player's season total is the sum of their Event and Major points. Championship
results are excluded. Standings are dense-ranked ascending, so the lowest total
is 1st and ties share a rank.

## History is never rewritten

Scores imported from the original spreadsheet are tagged `source = 'historical'`
and keep the place and points the league recorded at the time. They are never
recomputed, even if today's rules would produce a different answer.

This is deliberate. The pre-app handicap table drifted slightly from event to
event instead of staying locked, and the earliest 2013 rounds predate the
formulas entirely. Re-deriving would silently change results people remember.
`docs/MIGRATION.md` records exactly where the modern engine disagrees with the
old records and why — five events out of ninety-seven, three of them
Championships that are worth no points anyway.

Anything entered through the app is tagged `source = 'new'` and scored live by
the rules above.

## Who can do what

| | Owner | Admin | Member | Public |
|---|---|---|---|---|
| View standings, results, handicaps | ✓ | ✓ | ✓ | ✓ (if the league's board is public) |
| Enter their own score | ✓ | ✓ | ✓ | |
| Enter anyone's score | ✓ | ✓ | | |
| Create and edit events | ✓ | ✓ | | |
| Manage players, override handicaps | ✓ | ✓ | | |
| Grant and revoke admin | ✓ | | | |

These are enforced by row-level security in Postgres, not by application code,
so they hold no matter what does the writing. Player email addresses are never
public — they live in `player_contacts`, which only admins can read.
