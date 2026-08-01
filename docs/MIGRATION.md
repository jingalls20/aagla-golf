# Migrating off Google Sheets

How the AAGLA Iowa Chapter's fourteen years of league history moved from the
Apps Script app into Postgres, what was found along the way, and what was
deliberately changed.

Source: **AAGLA Data Set - Iowa Chapter**
(`1SYPaJHwIE56o17fHP3928cWXJh_oJyknxWjqZm9E9iY`), exported 1 August 2026 —
tabs `App Players`, `App Events`, `App Scores`, `App Handicaps`, `App Config`.

The migration lives in `supabase/migrations/` as ordinary migrations
(`0004_seed_iowa_chapter.sql`, `0005_fix_phantom_zero_scores.sql`) rather than
as a one-off script, so a database can be rebuilt from scratch with nothing but
the repo.

## What landed

| | Rows |
|---|---|
| Leagues | 1 (`aagla-iowa`) |
| Seasons | 14 (2013–2026) |
| Players | 26 |
| Player contacts | 7 |
| Events | 100 |
| Handicaps | 154 |
| Scores | 864 — 836 historical, 10 entered in the app, 18 missed |

## Fidelity check

Every score column was summed per season and per source and compared against
the same totals computed independently from the spreadsheet: row counts, true
scores, handicaps applied, course differentials, net scores, places and points.
**All sixteen season/source groups matched exactly**, including fractional
handicap sums agreeing to six decimal places (2013's handicaps total
308.651190 on both sides).

## Deliberate changes

Three, all of them corrections rather than reinterpretations.

**Three duplicated handicap rows collapsed to one.** Michael Olson had three
identical 2025 rows and BJ Neal two identical 2026 rows. They came from
`getHandicapOverview()` in the old `Code.gs`, which batch-appended newly locked
handicaps without checking whether it had already done so in a previous
request. Every copy carried the same value and the same note, so nothing was
lost. The new schema has `unique (season_id, player_id)` on `handicaps`, which
makes a recurrence impossible.

**Six blank handicap rows dropped.** Each belonged to a player with zero rounds
that season — placeholder columns on the old Free Strokes tab for people who
weren't in the league that year. A locked handicap with no value isn't a locked
handicap, and the absence of a row already means "not locked yet", so this
loses nothing.

**Fifteen phantom scores corrected.** See below. This one mattered.

## The phantom zero scores

The spreadsheet recorded a player who didn't show up as **True Score = 0**
instead of leaving the row out. Its own net-score formula couldn't cope and
returned `#NUM!` or blank for all fifteen, while the finishing place was filled
in by hand as the shared last place — which is exactly what this app calls a
"missed" round. The 2026 importer took those zeros at face value.

They cluster on players who drifted out of the league mid-season: Ryan Lameroux
across five 2022 events, Bill Ice / Will Ice / Josh Rudman across 2024, and a
few scattered championship no-shows.

Left alone, two things break:

1. **Handicaps come out too low.** The handicap formula averages a player's
   *best* N true scores, and a phantom 0 is almost always the best number in the
   window. Those players' locked handicaps for the following season were
   computed partly from rounds they never played.
2. **Any recompute puts the phantoms first.** Zero minus a double-digit
   handicap is a large negative net, so a recompute would rank a no-show as the
   winner and push every real player down one place per phantom row.

`0005_fix_phantom_zero_scores.sql` converts them to `source = 'missed'` with no
score, keeping the recorded place and points exactly as the league recorded
them.

Ten *other* rows also have True Score = 0 and were left alone — those are
genuine even-par rounds, distinguishable because their recorded net score is
internally consistent. The discriminator is the sheet's own broken net formula,
not the zero itself.

## Re-deriving history with the new engine

The ported rules in `lib/domain/` were run against all 97 played events and
compared to what the spreadsheet recorded.

| | Before the phantom fix | After |
|---|---|---|
| Net score | 92 / 97 | **97 / 97** |
| Place | 84 / 97 | 92 / 97 |
| Points | 90 / 97 | 95 / 97 |

Net score now agrees on every event in league history, which is the strongest
available evidence that the scoring formula was ported faithfully —
`floor(true − handicap) + differential`, including the order of operations.

Five events still disagree on place. Every one was inspected individually:

- **2014 #16, 2018 #44, 2019 #51** — all Championships, all cases where the
  spreadsheet broke a tie between equal net scores by some means the app
  doesn't model (a playoff or countback). In 2018 #44 John Gookin is recorded
  first on a net of 4 while another player with the same 4 is recorded fifth.
  **No effect on anything**: Championships are worth zero season points.
- **2013 #1** — three players, and the recorded places don't follow the net
  scores in any order (best net recorded second, worst also second). 2013
  predates the league's scoring formulas entirely, which the original importer
  already flagged.
- **2022 #70** — Angelo Gutierrez posted a valid net of 6 but was recorded in
  last place alongside the no-show, where another player on the same net of 6
  placed eighth. Looks like a disqualification or a manual correction.

None of this changes any stored result. Historical rows keep their recorded
place and points verbatim and are never recomputed — that rule is enforced by
`scores.source` and honoured by the recompute engine. The comparison is a test
of the *port*, not a proposal to rewrite anyone's remembered finish.

## Things that were checked and turned out fine

- **Will Ice vs. Bill Ice are two different people.** The original handoff
  flagged them as possible duplicates. They appear at all forty of the same
  events with different scores (13 vs 25, 15 vs 32, and so on), so they're
  genuinely two players. No other near-duplicate names exist, case-insensitively.
- **Negative handicaps are real.** The best players in this league carry a
  negative figure — they give strokes back rather than receive them. An early
  draft of the schema had a `fs >= 0` check, which would have rejected real
  data; it's gone.
- **Twenty-six historical rows have no points.** All from 2021 and 2022
  Championships, which are worth zero season points by design. The spreadsheet
  left them blank and so does the import.

## Not yet migrated

`App Config`'s `adminEmails` and `ownerEmail` have no equivalent rows yet,
because `league_members` links to `auth.users` and nobody has signed in to the
new app. On first sign-in, a user whose email matches a `player_contacts` row is
linked to that player automatically. Josh (`jingalls20@gmail.com`) needs the
`owner` role, and London Usher and Hayden Zeidler need `admin`, once their
accounts exist.

The original spreadsheet's other tabs — `AAGLA OVERVIEW`, `Event Scores`,
`Free Strokes (FS)`, `Data Admin`, the per-year sheets — were the *inputs* to
the 2026 Apps Script import and are not needed again. They stay in the sheet as
an archive.
