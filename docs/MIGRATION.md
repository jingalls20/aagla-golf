# Migrating off Google Sheets

How the AAGLA chapters' league history moved from the
Apps Script app into Postgres, what was found along the way, and what was
deliberately changed.

Both chapters ran on the same Apps Script app, each bound to its own
spreadsheet, so both had identical `App Players` / `App Events` / `App Scores` /
`App Handicaps` / `App Config` tabs and both migrated the same way.

| Source                                                                                | Exported      |
| ------------------------------------------------------------------------------------- | ------------- |
| **AAGLA Data Set - Iowa Chapter** (`1SYPaJHwIE56o17fHP3928cWXJh_oJyknxWjqZm9E9iY`)    | 1 August 2026 |
| **AAGLA Data Set - Seattle Chapter** (`1NZEFnPGx0x_Ghs0fYKEe0OvCt-GgEJ9_-vbq4qzE4xU`) | 1 August 2026 |

The migrations live in `supabase/migrations/` as ordinary migrations
(`0004`, `0005`, `0006`) rather than as one-off scripts, so a database can be
rebuilt from scratch with nothing but the repo.

## What landed

|                 | `aagla-iowa`   | `aagla-seattle` |
| --------------- | -------------- | --------------- |
| Seasons         | 14 (2013–2026) | 2 (2025–2026)   |
| Players         | 26             | 8               |
| Player contacts | 7              | 1               |
| Events          | 100            | 14              |
| Handicaps       | 154            | 16              |
| Scores          | 864            | 63              |

Iowa's scores break down as 836 historical, 10 entered in the app and 18 missed;
Seattle's as 56 historical, 6 new and 1 missed.

Five people play in both chapters — Angelo Gutierrez, Anthony Dworak, Josh
Ingalls, Josh Ramos and Tim Paccione. They are deliberately separate player rows
per league. A handicap, a history and a season standing belong to the chapter
they were earned in, and `players` is league-scoped for exactly this reason. If
a cross-chapter identity is ever wanted (a combined career record, say), that's
a `people` table above `players`, not a merge.

## Fidelity check — Iowa

Every score column was summed per season and per source and compared against
the same totals computed independently from the spreadsheet: row counts, true
scores, handicaps applied, course differentials, net scores, places and points.
**All sixteen season/source groups matched exactly**, including fractional
handicap sums agreeing to six decimal places (2013's handicaps total
308.651190 on both sides).

## Deliberate changes — Iowa

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
   _best_ N true scores, and a phantom 0 is almost always the best number in the
   window. Those players' locked handicaps for the following season were
   computed partly from rounds they never played.
2. **Any recompute puts the phantoms first.** Zero minus a double-digit
   handicap is a large negative net, so a recompute would rank a no-show as the
   winner and push every real player down one place per phantom row.

`0005_fix_phantom_zero_scores.sql` converts them to `source = 'missed'` with no
score, keeping the recorded place and points exactly as the league recorded
them.

Ten _other_ rows also have True Score = 0 and were left alone — those are
genuine even-par rounds, distinguishable because their recorded net score is
internally consistent. The discriminator is the sheet's own broken net formula,
not the zero itself.

## Re-deriving history with the new engine

The ported rules in `lib/domain/` were run against all 97 played events and
compared to what the spreadsheet recorded.

|           | Before the phantom fix | After       |
| --------- | ---------------------- | ----------- |
| Net score | 92 / 97                | **97 / 97** |
| Place     | 84 / 97                | 92 / 97     |
| Points    | 90 / 97                | 95 / 97     |

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
of the _port_, not a proposal to rewrite anyone's remembered finish.

## Seattle

Seattle is a much younger chapter — founded 2025 — and its data was created
entirely by the Apps Script app rather than inherited from years of hand-kept
spreadsheets. It shows. The same checks that found three separate problems in
Iowa's data found nothing at all here:

- No duplicate or near-duplicate player names.
- No orphaned event or player references.
- No duplicated handicap rows, and no blank ones.
- **No phantom zero-score rows.** Every recorded net score is internally
  consistent with its true score, handicap and course differential.

Aggregates were compared against the spreadsheet the same way, and all four
season/source groups matched exactly.

Re-deriving Seattle's history with the ported engine:

|           |                    |
| --------- | ------------------ |
| Net score | **12 / 12 events** |
| Place     | **12 / 12 events** |
| Points    | **12 / 12 events** |

A clean sweep, which is a useful independent check on the port: Seattle's
records were produced by the old app's own calculation rather than by years of
hand-maintained formulas, so perfect agreement is exactly what a faithful port
should produce. Where Iowa disagrees, it disagrees on pre-app data.

One small oddity, carried over as-is: Seattle event 11 (Bellevue) is marked
`scheduled` but already has one score recorded against it. Harmless, and worth
a glance next time someone is in the admin screen.

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

`App Config`'s `adminEmails` and `ownerEmail` have no equivalent rows yet in
either league, because `league_members` links to `auth.users` and nobody has
signed in to the new app. On first sign-in, a user whose email matches a
`player_contacts` row is linked to that player automatically.

Once accounts exist, the roles to set are:

- **`aagla-iowa`** — Josh (`jingalls20@gmail.com`) as `owner`; London Usher and
  Hayden Zeidler as `admin`.
- **`aagla-seattle`** — Josh as `owner`. The Seattle sheet's `adminEmails` was
  empty, so there is nobody else to carry over.

Note that Josh needs a membership row in _each_ league; the roles are per-league
by design.

The original spreadsheet's other tabs — `AAGLA OVERVIEW`, `Event Scores`,
`Free Strokes (FS)`, `Data Admin`, the per-year sheets — were the _inputs_ to
the 2026 Apps Script import and are not needed again. They stay in the sheet as
an archive.
