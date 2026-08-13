-- Player photos, uploaded rather than linked.
--
-- `players.photo_url` already accepts a URL, and still does -- an external
-- link remains perfectly valid. This adds somewhere to put a file when there
-- is no link to point at, which is the normal case: someone has a photo on
-- their phone, not on a website.
--
-- The bucket is public-read on purpose. A league board is a public scoreboard
-- (see leagues.public_board), so the faces on it are already public, and
-- signed URLs would expire and quietly break every avatar on the site.
-- Nothing sensitive belongs in here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Writes are keyed off the path. Every object lives at
-- `<league_id>/<player_id>-<n>.<ext>`, so the first folder names the league
-- the photo belongs to, and the existing app.is_league_admin() answers
-- whether the caller may touch it. That keeps one definition of "admin"
-- rather than a second copy living in storage policies.
create policy "player photos are readable by anyone"
  on storage.objects for select
  using (bucket_id = 'player-photos');

create policy "league admins may upload player photos"
  on storage.objects for insert
  with check (
    bucket_id = 'player-photos'
    and app.is_league_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "league admins may replace player photos"
  on storage.objects for update
  using (
    bucket_id = 'player-photos'
    and app.is_league_admin(((storage.foldername(name))[1])::uuid)
  );

create policy "league admins may delete player photos"
  on storage.objects for delete
  using (
    bucket_id = 'player-photos'
    and app.is_league_admin(((storage.foldername(name))[1])::uuid)
  );
