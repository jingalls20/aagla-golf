-- AAGLA Golf: row-level security.
--
-- The access rules the Apps Script version enforced in JavaScript
-- (isAdmin_ / isOwner_ / requireAdmin_ / "you can only enter your own score")
-- move into the database here. Enforcing them in Postgres means they hold no
-- matter which route, script, or future client does the writing -- a bug in
-- application code can no longer leak or corrupt another league's data.
--
-- The helpers live in a dedicated `app` schema, NOT in `public`. Anything in
-- `public` is automatically published by PostgREST as a callable REST endpoint,
-- which would expose these SECURITY DEFINER functions at /rest/v1/rpc/... to
-- anonymous callers. `app` is not in the exposed-schema list, so the functions
-- remain callable from inside policy expressions and nowhere else.
--
-- They must be SECURITY DEFINER: the policies on league_members would otherwise
-- have to read league_members to decide whether you may read league_members,
-- which recurses. search_path is pinned on every one of them, because a
-- SECURITY DEFINER function with a mutable search_path is a privilege
-- escalation vector.

create schema if not exists app;

-- Callable, but only from within the database (policy expressions). Not
-- reachable over the API, since `app` is not an exposed schema.
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function app.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function app.is_league_owner(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

-- The single player row the signed-in user may enter scores for.
create or replace function app.current_player_id(p_league_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.player_id from public.league_members m
  where m.league_id = p_league_id
    and m.user_id = (select auth.uid())
  limit 1;
$$;

-- Whether this league publishes an anonymously-readable scoreboard.
create or replace function app.league_is_public(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select l.public_board from public.leagues l where l.id = p_league_id),
    false
  );
$$;

-- Readable by a league member, or by anyone at all when the league has opted
-- into a public board. Used by every read policy below.
create or replace function app.can_read_league(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select app.league_is_public(p_league_id) or app.is_league_member(p_league_id);
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere. No table is left open.
-- ---------------------------------------------------------------------------

alter table public.leagues          enable row level security;
alter table public.seasons          enable row level security;
alter table public.players          enable row level security;
alter table public.player_contacts  enable row level security;
alter table public.league_members   enable row level security;
alter table public.events           enable row level security;
alter table public.handicaps        enable row level security;
alter table public.scores           enable row level security;
alter table public.audit_log        enable row level security;

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------

create policy leagues_read on public.leagues
  for select using (public_board or app.is_league_member(id));

create policy leagues_update on public.leagues
  for update using (app.is_league_owner(id)) with check (app.is_league_owner(id));

-- Creating a league is a deliberate provisioning step, not a user action:
-- no insert policy, so it goes through the service role only.

-- ---------------------------------------------------------------------------
-- Reference data: readable per can_read_league, writable by admins.
-- ---------------------------------------------------------------------------

create policy seasons_read on public.seasons
  for select using (app.can_read_league(league_id));
create policy seasons_write on public.seasons
  for all using (app.is_league_admin(league_id)) with check (app.is_league_admin(league_id));

create policy players_read on public.players
  for select using (app.can_read_league(league_id));
create policy players_write on public.players
  for all using (app.is_league_admin(league_id)) with check (app.is_league_admin(league_id));

create policy events_read on public.events
  for select using (app.can_read_league(league_id));
create policy events_write on public.events
  for all using (app.is_league_admin(league_id)) with check (app.is_league_admin(league_id));

create policy handicaps_read on public.handicaps
  for select using (app.can_read_league(league_id));
create policy handicaps_write on public.handicaps
  for all using (app.is_league_admin(league_id)) with check (app.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- player_contacts: never public. Emails are visible to league admins only,
-- plus each member's own row. This is why email lives here and not on
-- players -- the public board grants anonymous read on players, and RLS is
-- row-level, not column-level.
-- ---------------------------------------------------------------------------

create policy player_contacts_admin_all on public.player_contacts
  for all using (app.is_league_admin(league_id)) with check (app.is_league_admin(league_id));

create policy player_contacts_read_own on public.player_contacts
  for select using (player_id = app.current_player_id(league_id));

-- ---------------------------------------------------------------------------
-- league_members: visible to the league, managed by the owner.
-- ---------------------------------------------------------------------------

create policy league_members_read on public.league_members
  for select using (app.is_league_member(league_id));

create policy league_members_manage on public.league_members
  for all using (app.is_league_owner(league_id)) with check (app.is_league_owner(league_id));

-- ---------------------------------------------------------------------------
-- scores
--
-- This is the rule that mattered most in the old app: a player may write their
-- own score and nobody else's. Previously a JavaScript check inside
-- submitScore(); now the database will not accept the row at all.
-- ---------------------------------------------------------------------------

create policy scores_read on public.scores
  for select using (app.can_read_league(league_id));

create policy scores_insert on public.scores
  for insert with check (
    app.is_league_admin(league_id)
    or player_id = app.current_player_id(league_id)
  );

create policy scores_update on public.scores
  for update using (
    app.is_league_admin(league_id)
    or player_id = app.current_player_id(league_id)
  ) with check (
    app.is_league_admin(league_id)
    or player_id = app.current_player_id(league_id)
  );

-- Deleting a score is an admin correction, never a self-service action.
create policy scores_delete on public.scores
  for delete using (app.is_league_admin(league_id));

-- ---------------------------------------------------------------------------
-- audit_log: append-only. Members write their own entries, admins read them.
-- No update or delete policy exists, so the trail cannot be edited away.
-- ---------------------------------------------------------------------------

create policy audit_log_read on public.audit_log
  for select using (app.is_league_admin(league_id));

create policy audit_log_insert on public.audit_log
  for insert with check (
    app.is_league_member(league_id)
    and actor_user_id = (select auth.uid())
  );
