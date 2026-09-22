-- One face per person, whichever chapter it was uploaded in.
--
-- Players are per-chapter rows, joined into people only by name (the record
-- book, the player page and the world ranking all match that way). Photos
-- never followed: five people play in both chapters, and every one of them
-- had been uploaded twice, minutes apart, once per chapter. This makes a
-- photo a property of the person rather than of the roster row.
--
-- Done in the database rather than in the upload action, for two reasons.
-- A trigger covers every path that sets a photo -- the upload, the edit
-- form's URL field, and a new roster row added next season -- without each
-- remembering to. And the other chapter's rows are, correctly, beyond an
-- admin's reach under row-level security: an Iowa admin cannot write to
-- Seattle's roster. The trigger runs as its owner so the face can follow the
-- person, and it touches nothing on those rows except the photo.
--
-- The name match carries the caveat it has everywhere else in the app: two
-- different people with the same name would share a photo.

create or replace function app.normalise_name(p_name text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(btrim(p_name), '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- The one-time reconciliation, run before the triggers exist so it cannot
-- set them off.
--
-- Where one person has different photos in different chapters, one has to
-- win. The rule: an uploaded photo beats an external link, and then the most
-- recent upload beats an older one.
--
-- Uploads first because external links rot. The one in this data is a
-- Facebook CDN address carrying a signed expiry (`oe=6A9B69BD`, the 5th of
-- September 2026) and has almost certainly stopped loading. An upload lives
-- in this project's own storage and does not expire.
--
-- Most recent next because that is the rule going forward: re-uploading a
-- face anywhere replaces it everywhere. The file's own upload time is used
-- rather than the row's updated_at, which also moves when somebody's status
-- is toggled and says nothing about the picture.
-- ---------------------------------------------------------------------------

with candidates as (
  select
    app.normalise_name(p.name) as person,
    p.photo_url,
    (p.photo_url like '%/storage/v1/object/public/player-photos/%') as is_upload,
    coalesce(o.created_at, p.updated_at) as photographed_at
  from public.players p
  left join storage.objects o
    on o.bucket_id = 'player-photos'
   and p.photo_url like '%/player-photos/' || o.name
  where p.photo_url is not null
),
winners as (
  select distinct on (person) person, photo_url
  from candidates
  order by person, is_upload desc, photographed_at desc nulls last
)
update public.players p
set photo_url = w.photo_url
from winners w
where app.normalise_name(p.name) = w.person
  and p.photo_url is distinct from w.photo_url;

-- ---------------------------------------------------------------------------
-- Going forward.
-- ---------------------------------------------------------------------------

-- A new roster row inherits the person's face if they already have one.
-- Next season's Seattle signing who played in Iowa arrives with a photo.
create or replace function app.inherit_player_photo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.photo_url is null then
    select p.photo_url into new.photo_url
    from public.players p
    where app.normalise_name(p.name) = app.normalise_name(new.name)
      and p.photo_url is not null
    order by p.updated_at desc nulls last
    limit 1;
  end if;
  return new;
end;
$$;

-- A changed photo follows the person to their other rows. Clearing one
-- clears it everywhere too, for the same reason: it is one person's face.
create or replace function app.share_player_photo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The update below fires this trigger again on each row it touches. Only
  -- the change a person actually made should spread.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  update public.players
  set photo_url = new.photo_url
  where app.normalise_name(name) = app.normalise_name(new.name)
    and id <> new.id
    and photo_url is distinct from new.photo_url;

  return new;
end;
$$;

drop trigger if exists players_inherit_photo on public.players;
create trigger players_inherit_photo
  before insert on public.players
  for each row execute function app.inherit_player_photo();

-- `of photo_url` plus the distinct check: the edit form writes the photo on
-- every save, changed or not, and an unchanged value must not spread.
drop trigger if exists players_share_photo on public.players;
create trigger players_share_photo
  after update of photo_url on public.players
  for each row
  when (old.photo_url is distinct from new.photo_url)
  execute function app.share_player_photo();
