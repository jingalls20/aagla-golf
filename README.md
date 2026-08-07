# AAGLA Golf

Golf league management for the AAGLA chapters. Tracks events, scores, handicaps
and season standings; calculates places and points as scores come in; keeps a
per-player record going back to 2013.

Replaces a Google Apps Script app bound to a spreadsheet. All fourteen years of
history came across intact — see [`docs/MIGRATION.md`](docs/MIGRATION.md).

## Stack

Next.js (App Router) · TypeScript · Supabase (Postgres, Auth, row-level
security) · Tailwind · Vitest · deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in from the Supabase dashboard
npm run dev
```

Before pushing:

```bash
npm run verify                 # typecheck + lint + format + tests
```

## How this is organised

```
app/                  routes, one directory per screen
lib/domain/           the league's rules, as pure functions
lib/supabase/         typed Supabase clients (server, browser, middleware)
lib/types/database.ts generated from the schema — do not edit by hand
supabase/migrations/  the schema, in order. the source of truth.
docs/                 rules, architecture, migration notes
scripts/              one-off and maintenance scripts
```

### The one thing worth understanding

Everything the league considers a _rule_ — how a field is placed, how points are
awarded, how a handicap is calculated — lives in `lib/domain/` as pure
functions. No database access, no `fetch`, no clock, no randomness. Data comes
in as arguments, decisions come out as return values, and the caller does the
persisting.

That's what makes the rules testable without standing up a database, and it's
why they have the densest test coverage in the repo. When you change a rule,
change it there and write the failing test first.

[`docs/RULES.md`](docs/RULES.md) is the plain-English version of the same
thing — worth reading before touching `lib/domain/`.

## Database changes

The schema lives in `supabase/migrations/` and is applied in filename order.

1. Add a new numbered `.sql` file. Never edit one that has already been applied.
2. Apply it: `npm run db:push`
3. Regenerate types: `npm run db:types`
4. Commit the migration and the regenerated `lib/types/database.ts` together.

Every table has row-level security enabled, and the policies are the real access
control — application code is not trusted to enforce permissions. Helper
functions used by policies live in the `app` schema, deliberately not `public`,
because anything in `public` is published by PostgREST as a callable endpoint.

After any schema change, check Supabase's linter for missing policies and unsafe
functions before merging.

## Multi-league

The app is multi-tenant from the ground up. Every row carries a `league_id`, and
RLS scopes reads and writes to leagues you belong to. Routes are namespaced by
league slug (`/aagla-iowa/standings`, `/aagla-seattle/standings`).

Two chapters are loaded: `aagla-iowa` (2013–2026) and `aagla-seattle`
(2025–2026). Roles are per-league — being an admin of one grants nothing in the
other, and that boundary is enforced in Postgres, not in application code.

Five people play in both chapters and have a separate `players` row in each.
That is deliberate: a handicap and a season standing belong to the chapter they
were earned in.

A league with `public_board = true` exposes a read-only scoreboard at
`/<slug>/board` with no sign-in and no navigation, intended to be embedded in a
league website. Player email addresses are never part of that surface.

Creating a league is a provisioning step and deliberately has no RLS insert
policy — it goes through the service role.

## Sign-in

Google OAuth or an emailed magic link, both via Supabase Auth. On first sign-in
a user whose email matches a `player_contacts` row is linked to that player
automatically, which is what scopes them to entering their own score.

Roles are `owner`, `admin` and `member`, stored in `league_members`. The owner is
the only role that can grant or revoke admin.
