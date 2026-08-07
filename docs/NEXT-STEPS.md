# Where this got to, and what's next

## Live

**https://aagla-golf.vercel.app** — deployed to Vercel, reading the live
database. No sign-in needed: both chapters publish a public board, so the whole
read surface works signed out.

Verified against the running site: the chapter picker lists both leagues; Iowa's
2026 standings render with dense ranking working correctly (two players sharing
4th on 8.5 points); Seattle's handicaps show admin overrides labelled as such;
and `/aagla-iowa/board` renders with no navigation and no email addresses, as an
embeddable scoreboard should.

Deployed straight from source rather than from GitHub, so there is no repo
connected yet and no automatic redeploy on change. See "If you want GitHub
later" below.

## Done

**Supabase project `aagla-golf`** (ref `fxkduqairawxmhxatpxd`, us-east-1) is
live with the full schema, row-level security on every table, and **both
chapters loaded and verified** — Iowa's fourteen years and Seattle's two.
Supabase's security linter reports zero findings.

|         | `aagla-iowa`   | `aagla-seattle` |
| ------- | -------------- | --------------- |
| Seasons | 14 (2013–2026) | 2 (2025–2026)   |
| Players | 26             | 8               |
| Events  | 100            | 14              |
| Scores  | 864            | 63              |

**The domain layer** — every scoring, handicap and standings rule from the old
`Code.gs` — is ported to pure TypeScript in `lib/domain/` with 51 tests.

**Verified, not just written:**

- Every score column summed per season and per source against both
  spreadsheets. All 20 groups matched exactly, fractional handicaps to six
  decimal places.
- The ported engine re-derives the correct net score for 97 of 97 Iowa events,
  and gets a clean 12 of 12 on net, place AND points for Seattle.
- Anonymous access probed directly against the database: the public board reads
  (leagues, players, scores, handicaps, seasons) but emails, member roles and
  the audit log return zero rows, and all five write paths tried — insert a
  score, rename a player, delete every score, create a league, flip a league's
  settings — were refused.
- **Cross-chapter isolation probed with a real signed-in user.** An admin of
  Iowa could not write a Seattle score, rename a Seattle player, delete Seattle
  events, or see a single Seattle email or member role — while still being able
  to write their own chapter, which is the control that proves the tenancy
  boundary is doing the blocking rather than a broken policy.

Read `docs/MIGRATION.md` for what changed in the data and why, and
`docs/RULES.md` for the league's rules written out properly for the first time.

## To pick up

### If you want GitHub later

Nothing about this needs redoing. The repo already has full git history; adding
a remote is two commands whenever you feel like it:

```bash
npm install
npm run verify          # typecheck + lint + format + 51 tests
git remote add origin https://github.com/<you>/aagla-golf.git
git push -u origin main
```

Then import the repo in Vercel and it redeploys on every push, with a preview
URL per change. Until then, deploys happen by pushing the source tree straight
to Vercel, and the zip you were sent is the backup.

### Next up

Enable Google OAuth and magic links in Supabase Auth, then build out, roughly
in this order:

1. `/login` and `/auth/callback`, plus first-sign-in linking — match a new
   user's email against `player_contacts` and create their `league_members`
   row. Roles are per-league, so Josh needs a row in each: `owner` of
   `aagla-iowa` and `owner` of `aagla-seattle`. London Usher and Hayden
   Zeidler need `admin` on Iowa. Seattle's old `adminEmails` was empty, so
   there is nobody else to carry over there.
2. Read-only screens: dashboard (standings + the player×event matrix), event
   results, handicaps, player profiles, and `/<slug>/board` for the embeddable
   scoreboard. Ship these before any write path — parity is easy to eyeball
   against the two live Apps Script apps. Having two chapters loaded from day
   one is useful here: any screen that accidentally forgets to scope by league
   will show Iowa's 26 players next to Seattle's 8 and be obvious immediately.
3. Write paths: score entry (personal card and admin grid), event create/edit,
   player and role management, handicap overrides. The old UI saved the admin
   grid one row at a time with a separate round trip each; this should be a
   single transactional submit.
4. Cutover: repoint `tinyurl.com/AAGLAGOLF`, replace **both** Apps Script web
   apps with a notice pointing at the new URL, freeze both sheets as archives.

`app/page.tsx` is a working league picker and shows the intended shape: query
through the RLS-scoped server client and render whatever comes back, rather
than filtering by permission in application code.

## Two things worth a decision

**The five events where the engine disagrees with the old records.**
Three are Championships where the spreadsheet broke a tie between equal net
scores somehow — a playoff or countback the app doesn't model. Championships
score no points, so nothing is affected. 2013 #1 predates the league's formulas.
2022 #70 has Angelo Gutierrez recorded last on a valid net of 6, while another
player on the same 6 placed eighth — possibly a disqualification. None of these
change any stored result; they only tell us where a recompute would differ.
Worth confirming whether the Championship tie-break is a real rule that should
be modelled.

**Seattle event 11 (Bellevue)** is marked `scheduled` but already has a score
recorded against it. Carried over as-is; worth a glance next time you're in the
admin screen.

**Handicaps computed from phantom scores.** The 15 corrected rows were feeding
into the handicap formula, which averages a player's _best_ scores. Locked
handicaps for the seasons following 2021, 2022 and 2024 may be slightly low for
Ryan Lameroux, Bill Ice, Will Ice, Josh Rudman, David Back, Jansel Herrera and
John Gookin. The stored values were left untouched rather than silently
recomputed — deleting a player's auto-calculated (non-override) handicap row
makes it recompute from the corrected history next time it's read.
