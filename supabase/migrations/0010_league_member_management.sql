-- AAGLA Golf: co-admin management.
--
-- league_members.user_id is NOT NULL and FK'd to auth.users, so a league
-- owner can't add someone by email alone through a plain insert -- there's no
-- user_id to write until Postgres knows who that email belongs to, and
-- auth.users isn't exposed over the API. These two SECURITY DEFINER functions
-- are the narrow bridge: one resolves an email to a league_members row (only
-- for a league's own owner, and only for someone who has already signed in
-- at least once), the other lists a league's members with their email
-- attached for the admin screen. Both live in `public` (unlike the app.*
-- helpers in 0003_rls.sql) because PostgREST only exposes callable functions
-- in schemas it's configured to serve, and the app calls these directly via
-- supabase.rpc(...).

create or replace function public.invite_league_member(
  p_league_id uuid,
  p_email text,
  p_role public.member_role
)
returns public.league_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_row public.league_members;
begin
  if not app.is_league_owner(p_league_id) then
    raise exception 'Only the league owner can manage admin access.' using errcode = '42501';
  end if;

  if p_role = 'owner' then
    raise exception 'Ownership can''t be transferred from this screen.' using errcode = '42501';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_user_id is null then
    raise exception 'No account found for %. Ask them to sign in once first, then invite them again.', p_email
      using errcode = 'P0002';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (p_league_id, v_user_id, p_role)
  on conflict (league_id, user_id) do update set role = excluded.role
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.invite_league_member(uuid, text, public.member_role) to authenticated;

create or replace function public.list_league_members(p_league_id uuid)
returns table(id uuid, user_id uuid, email text, role public.member_role, created_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_league_admin(p_league_id) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.role, m.created_at
    from public.league_members m
    join auth.users u on u.id = m.user_id
    where m.league_id = p_league_id
    order by m.role, u.email;
end;
$$;

grant execute on function public.list_league_members(uuid) to authenticated;
