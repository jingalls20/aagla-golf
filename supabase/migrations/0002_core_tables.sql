-- AAGLA Golf: core schema.
--
-- Every table below carries league_id. That is the multi-tenancy backbone:
-- one install serves the Iowa chapter, the Seattle chapter, and anyone else,
-- with row-level security (0003) making the separation enforceable rather
-- than merely conventional.
--
-- legacy_id columns preserve the numeric IDs from the original Google Sheet so
-- any row can be traced back to its source during and after the migration.

-- ---------------------------------------------------------------------------
-- updated_at housekeeping
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) > 0),
  chapter text,
  -- When true, the standings/handicaps board is readable without signing in.
  -- This is what powers the embeddable scoreboard the league website iframes.
  public_board boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- seasons
--
-- The Apps Script version hardcoded the points table in Code.gs and kept
-- handicapBestOf / handicapWindowEvents in a global App Config tab, so
-- changing a rule silently changed how every past season would be computed.
-- Pinning the rules to the season they governed keeps history stable.
-- ---------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  year int not null check (year between 1900 and 2200),

  -- Handicap ("free strokes") formula: average of the best N true scores out
  -- of the player's last M Event/Major rounds of the prior season.
  handicap_best_of int not null default 3 check (handicap_best_of > 0),
  handicap_window_events int not null default 7 check (handicap_window_events > 0),

  -- Points awarded by finishing place, keyed by event type. Places worse than
  -- cap_place score the same as cap_place. Championship events are worth zero
  -- season points by design, hence the empty object.
  points_table jsonb not null default jsonb_build_object(
    'cap_place', 10,
    'event', jsonb_build_object(
      '1', 0, '2', 1, '3', 1.5, '4', 2, '5', 2.5,
      '6', 3, '7', 3.5, '8', 4, '9', 4.5, '10', 5
    ),
    'major', jsonb_build_object(
      '1', 0, '2', 2, '3', 3, '4', 4, '5', 5,
      '6', 6, '7', 7, '8', 8, '9', 9, '10', 10
    ),
    'championship', '{}'::jsonb
  ),

  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, year)
);

create index seasons_league_id_idx on public.seasons (league_id);

create trigger seasons_set_updated_at
  before update on public.seasons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- players
-- ---------------------------------------------------------------------------

create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  legacy_id int,
  name text not null check (length(trim(name)) > 0),
  status public.player_status not null default 'active',
  first_year int check (first_year between 1900 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, legacy_id)
);

create index players_league_id_idx on public.players (league_id);

-- Names are the league's natural key for a person, and duplicate/variant
-- spellings were a known problem in the sheet import ("Robbins" vs
-- "Loren Robbins"). Enforcing uniqueness stops new ones appearing.
create unique index players_league_name_unique
  on public.players (league_id, lower(trim(name)));

create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- player_contacts
--
-- Email lives in its own table rather than on players because the public
-- scoreboard grants anonymous read on players, and RLS is row-level, not
-- column-level. Separating the contact details keeps them admin-only.
-- ---------------------------------------------------------------------------

create table public.player_contacts (
  player_id uuid primary key references public.players(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete cascade,
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index player_contacts_league_email_unique
  on public.player_contacts (league_id, lower(email))
  where email is not null;

create trigger player_contacts_set_updated_at
  before update on public.player_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- league_members
--
-- Replaces two things at once: the Email column on the App Players tab, and
-- the comma-separated adminEmails string in App Config that isAdmin_() used to
-- substring-match against. Role is now a real column with a real constraint.
-- The old single ownerEmail config value becomes role = 'owner'.
-- ---------------------------------------------------------------------------

create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid references public.players(id) on delete set null,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, user_id),
  unique (league_id, player_id)
);

create index league_members_user_id_idx on public.league_members (user_id);

create trigger league_members_set_updated_at
  before update on public.league_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events
--
-- `sequence` makes chronological order explicit. The Apps Script version
-- relied on EventID ordering as an implicit proxy for "which rounds came last"
-- when picking the handicap window; depending on a surrogate key's ordering is
-- exactly the kind of hidden coupling that breaks years later.
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  legacy_id int,
  sequence int not null check (sequence > 0),
  event_type public.event_type not null default 'event',
  name text,
  event_date date,
  course text,
  status public.event_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (league_id, legacy_id),
  unique (season_id, sequence)
);

create index events_league_id_idx on public.events (league_id);
create index events_season_id_idx on public.events (season_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- handicaps
--
-- One locked "free strokes" figure per player per season. Locked at first use
-- and then held steady for the whole season, so a player's handicap cannot
-- drift underneath them mid-year.
-- ---------------------------------------------------------------------------

create table public.handicaps (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  -- Plain `numeric`, not numeric(6,2): a handicap is the average of a player's
  -- best rounds, so values like 4.666666666666667 are routine and rounding them
  -- at rest would quietly disagree with a decade of recorded history. Display
  -- rounding belongs in the UI.
  --
  -- No `fs >= 0` check either. A scratch-or-better player carries a negative
  -- handicap in this league -- they give strokes back rather than receive them.
  fs numeric not null default 0,
  note text,
  -- Set by an admin rather than derived. The auto-calculation must never
  -- silently overwrite one of these.
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (season_id, player_id)
);

create index handicaps_league_id_idx on public.handicaps (league_id);
create index handicaps_player_id_idx on public.handicaps (player_id);

create trigger handicaps_set_updated_at
  before update on public.handicaps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- scores
--
-- true_score is nullable because a 'missed' row records a finishing place and
-- its points penalty without any round actually having been played.
-- ---------------------------------------------------------------------------

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  legacy_id int,

  -- All plain `numeric` for the same reason as handicaps.fs: these carry
  -- computed averages and half-points that must survive a round trip exactly.
  true_score numeric,
  fs_applied numeric,
  course_differential numeric not null default 0,
  net_score numeric,
  place int check (place > 0),
  event_points numeric,
  source public.score_source not null default 'new',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (event_id, player_id),
  -- A round that was actually played must record what was shot.
  constraint scores_played_rounds_have_a_score
    check (source = 'missed' or true_score is not null)
);

create index scores_league_id_idx on public.scores (league_id);
create index scores_event_id_idx on public.scores (event_id);
create index scores_player_id_idx on public.scores (player_id);

create trigger scores_set_updated_at
  before update on public.scores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- audit_log
--
-- The sheet had revision history for free; Postgres does not. Every mutation
-- through the app writes here so "who changed my score?" stays answerable.
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  league_id uuid references public.leagues(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_league_created_idx on public.audit_log (league_id, created_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
