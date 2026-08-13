'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLeagueAdmin } from '@/lib/data/admin';
import { DEFAULT_POINTS_TABLE } from '@/lib/domain/points';
import type { EventType } from '@/lib/domain/types';

/**
 * League management: building out a season (creating it, naming its events,
 * marking it current) and the player roster (who's active, adding a new
 * player, setting a photo). Grouped separately from `scores.ts` because these
 * change what the league's structure *is*, not what happened in a round.
 *
 * Every action re-checks admin membership itself rather than trusting the
 * page that rendered the form -- RLS would reject the write either way, but
 * a clear redirect beats a raw policy error, same reasoning as scores.ts.
 */

async function requireAdmin(leagueId: string, slug: string): Promise<void> {
  if (!(await isLeagueAdmin(leagueId))) {
    redirect(`/${slug}`);
  }
}

/**
 * Create a season, seeded with the league's standard points table and a
 * 3-of-7 handicap rule. It starts with no events and isn't the current
 * season until an admin explicitly makes it so -- see `setCurrentSeason` --
 * so building next year's season early never disturbs the one still being
 * played.
 */
export async function createSeason(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const year = Number(formData.get('year'));
  const handicapBestOf = Number(formData.get('handicapBestOf') ?? 3) || 3;
  const handicapWindowEvents = Number(formData.get('handicapWindowEvents') ?? 7) || 7;

  if (!leagueId || !slug || !Number.isFinite(year)) {
    throw new Error(
      'Missing leagueId, slug, or a valid year on the create-season form.',
    );
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('seasons')
    .insert({
      league_id: leagueId,
      year,
      handicap_best_of: handicapBestOf,
      handicap_window_events: handicapWindowEvents,
      points_table: DEFAULT_POINTS_TABLE,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Creating the ${year} season: ${error.message}`);

  const seasonId = (data as unknown as { id: string }).id;
  redirect(`/${slug}/admin/seasons/${seasonId}`);
}

/**
 * Exactly one current season per league is a database guarantee (a partial
 * unique index on `seasons.is_current`), so the old one has to be cleared
 * before the new one can be set -- doing it in the other order would collide
 * with that constraint.
 */
export async function setCurrentSeason(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!leagueId || !slug || !seasonId) {
    throw new Error(
      'Missing leagueId, slug, or seasonId on the set-current-season form.',
    );
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error: clearError } = await supabase
    .from('seasons')
    .update({ is_current: false })
    .eq('league_id', leagueId)
    .eq('is_current', true)
    .neq('id', seasonId);
  if (clearError)
    throw new Error(`Clearing the previous current season: ${clearError.message}`);

  const { error: setError } = await supabase
    .from('seasons')
    .update({ is_current: true })
    .eq('id', seasonId);
  if (setError) throw new Error(`Setting the current season: ${setError.message}`);

  redirect(`/${slug}/admin/seasons`);
}

/**
 * Add one or more events to a season in a single submit, named and typed up
 * front -- the season-builder alternative to creating them one at a time.
 * Sequence continues from whatever the season already has, in the order the
 * rows were filled in. A row with no name is treated as an unused spare (the
 * form always renders a few blank rows) and silently skipped.
 */
export async function addEvents(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!leagueId || !slug || !seasonId) {
    throw new Error('Missing leagueId, slug, or seasonId on the add-events form.');
  }
  await requireAdmin(leagueId, slug);

  const rowCount = Number(formData.get('rowCount') ?? 0);
  const rows: {
    name: string;
    eventType: EventType;
    eventDate: string | null;
    course: string | null;
  }[] = [];
  for (let i = 0; i < rowCount; i++) {
    const name = String(formData.get(`event_name_${i}`) ?? '').trim();
    if (!name) continue;
    const eventTypeRaw = String(formData.get(`event_type_${i}`) ?? 'event');
    const eventType: EventType =
      eventTypeRaw === 'major' || eventTypeRaw === 'championship'
        ? eventTypeRaw
        : 'event';
    const eventDate = String(formData.get(`event_date_${i}`) ?? '').trim() || null;
    const course = String(formData.get(`event_course_${i}`) ?? '').trim() || null;
    rows.push({ name, eventType, eventDate, course });
  }
  if (rows.length === 0) {
    redirect(`/${slug}/admin/seasons/${seasonId}`);
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('events')
    .select('sequence')
    .eq('season_id', seasonId)
    .order('sequence', { ascending: false })
    .limit(1);
  const startSequence =
    (((existing ?? [])[0] as unknown as { sequence: number } | undefined)?.sequence ??
      0) + 1;

  const insertRows = rows.map((r, i) => ({
    league_id: leagueId,
    season_id: seasonId,
    sequence: startSequence + i,
    event_type: r.eventType,
    name: r.name,
    event_date: r.eventDate,
    course: r.course,
    status: 'scheduled' as const,
  }));
  const { error } = await supabase.from('events').insert(insertRows);
  if (error) throw new Error(`Adding events: ${error.message}`);

  redirect(`/${slug}/admin/seasons/${seasonId}?added=${rows.length}`);
}

/**
 * Change an event's status directly -- mainly for cancelling one (a rained-
 * out round) or reinstating a cancelled one. Saving a score already marks an
 * event 'played' automatically (see `saveEventScores`), so this exists for
 * the cases that isn't: nothing was ever going to be played.
 */
export async function setEventStatus(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (
    !leagueId ||
    !slug ||
    !seasonId ||
    !eventId ||
    !['scheduled', 'played', 'cancelled'].includes(status)
  ) {
    throw new Error('Missing or invalid fields on the event-status form.');
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase.from('events').update({ status }).eq('id', eventId);
  if (error) throw new Error(`Updating event status: ${error.message}`);

  redirect(`/${slug}/admin/seasons/${seasonId}`);
}

/**
 * Active/inactive is global, not scoped to one season -- there's no
 * per-season roster table, so this is the same lever the dashboard, score
 * entry, and handicaps screens all read. Toggling it here is meant to happen
 * as part of getting a new season ready, but it takes effect everywhere the
 * moment it's saved.
 */
export async function setPlayerStatus(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const playerId = String(formData.get('playerId') ?? '');
  const status = String(formData.get('status') ?? '');
  if (
    !leagueId ||
    !slug ||
    !playerId ||
    (status !== 'active' && status !== 'inactive')
  ) {
    throw new Error('Missing or invalid fields on the player-status form.');
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({ status })
    .eq('id', playerId);
  if (error) throw new Error(`Updating player status: ${error.message}`);

  redirect(`/${slug}/admin/players`);
}

/** New players join active by default -- an admin marks them inactive later if that changes. */
export async function addPlayer(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const firstYearRaw = String(formData.get('firstYear') ?? '').trim();
  if (!leagueId || !slug || !name) {
    throw new Error('Missing leagueId, slug, or name on the add-player form.');
  }
  await requireAdmin(leagueId, slug);

  const firstYear = firstYearRaw ? Number(firstYearRaw) : null;

  const supabase = await createClient();
  const { error } = await supabase.from('players').insert({
    league_id: leagueId,
    name,
    status: 'active',
    first_year: firstYear !== null && Number.isFinite(firstYear) ? firstYear : null,
  });
  if (error) throw new Error(`Adding player ${name}: ${error.message}`);

  redirect(`/${slug}/admin/players`);
}

/**
 * Full edit of a player's own record -- name, first year, and photo, all in
 * one form. Separate from `setPlayerStatus` because status is a one-click
 * toggle used constantly (getting ready for a new season); these fields
 * change rarely, so they get one deliberate "Save" instead.
 */
export async function updatePlayer(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const playerId = String(formData.get('playerId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const firstYearRaw = String(formData.get('firstYear') ?? '').trim();
  const photoUrlRaw = String(formData.get('photoUrl') ?? '').trim();
  if (!leagueId || !slug || !playerId || !name) {
    throw new Error(
      'Missing leagueId, slug, playerId, or name on the player-edit form.',
    );
  }
  await requireAdmin(leagueId, slug);

  const firstYear = firstYearRaw ? Number(firstYearRaw) : null;
  const photoUrl = photoUrlRaw === '' ? null : photoUrlRaw;
  if (photoUrl !== null && !/^https?:\/\//.test(photoUrl)) {
    throw new Error('Photo URL must start with http:// or https://.');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('players')
    .update({
      name,
      first_year: firstYear !== null && Number.isFinite(firstYear) ? firstYear : null,
      photo_url: photoUrl,
    })
    .eq('id', playerId);
  if (error) throw new Error(`Updating player ${playerId}: ${error.message}`);

  redirect(`/${slug}/admin/players`);
}

/**
 * Correct any of an event's own fields after the fact -- name, type, date,
 * course, or its sequence within the season. `setEventStatus`'s job (played /
 * scheduled / cancelled) is folded in here too, so one form covers everything
 * about the event except its scores.
 */
/**
 * Upload a photo for one player and point their record at it.
 *
 * The file goes to the `player-photos` bucket under `<league_id>/<player_id>`,
 * which is the path the storage policies read to decide who may write -- see
 * migration 0011. Keeping the league id in the path means storage reuses the
 * same `app.is_league_admin()` the rest of the app uses, rather than growing a
 * second idea of who counts as an admin.
 *
 * The object name carries a counter so a replacement lands on a fresh path.
 * Overwriting in place would keep the URL stable and leave every browser and
 * CDN showing the old face until their cache expired, which reads as "the
 * upload silently didn't work".
 */
export async function uploadPlayerPhoto(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const playerId = String(formData.get('playerId') ?? '');
  const file = formData.get('photo');

  if (!leagueId || !slug || !playerId) {
    throw new Error('Missing leagueId, slug, or playerId on the photo upload form.');
  }
  await requireAdmin(leagueId, slug);

  // An empty file input still submits, as a zero-byte File. Treat that as
  // "they pressed save without choosing anything" rather than an error.
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/${slug}/admin/players`);
  }

  const ALLOWED: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  const ext = ALLOWED[file.type];
  if (!ext) {
    throw new Error(
      `Unsupported image type ${file.type || '(unknown)'}. Use JPEG, PNG, WebP or GIF.`,
    );
  }
  const MAX_BYTES = 5 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    throw new Error(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)}MB; the limit is 5MB.`,
    );
  }

  const supabase = await createClient();

  // A cheap monotonic suffix, taken from what is already stored. Avoids a
  // clock, and avoids collisions when two uploads land in the same second.
  const { data: existing } = await supabase.storage
    .from('player-photos')
    .list(leagueId, { search: playerId });
  const nextIndex = (existing ?? []).length + 1;
  const path = `${leagueId}/${playerId}-${nextIndex}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('player-photos')
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) {
    throw new Error(`Uploading photo for player ${playerId}: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('player-photos').getPublicUrl(path);

  const { error } = await supabase
    .from('players')
    .update({ photo_url: publicUrl })
    .eq('id', playerId);
  if (error) throw new Error(`Setting photo for player ${playerId}: ${error.message}`);

  redirect(`/${slug}/admin/players`);
}

export async function updateEvent(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const eventTypeRaw = String(formData.get('eventType') ?? 'event');
  const eventType: EventType =
    eventTypeRaw === 'major' || eventTypeRaw === 'championship'
      ? eventTypeRaw
      : 'event';
  const eventDate = String(formData.get('eventDate') ?? '').trim() || null;
  const course = String(formData.get('course') ?? '').trim() || null;
  const sequenceRaw = Number(formData.get('sequence'));
  const status = String(formData.get('status') ?? 'scheduled');
  if (
    !leagueId ||
    !slug ||
    !seasonId ||
    !eventId ||
    !Number.isFinite(sequenceRaw) ||
    !['scheduled', 'played', 'cancelled'].includes(status)
  ) {
    throw new Error('Missing or invalid fields on the event-edit form.');
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase
    .from('events')
    .update({
      name: name || null,
      event_type: eventType,
      event_date: eventDate,
      course,
      sequence: sequenceRaw,
      status,
    })
    .eq('id', eventId);
  if (error) throw new Error(`Updating event ${eventId}: ${error.message}`);

  redirect(`/${slug}/admin/seasons/${seasonId}`);
}

/**
 * Remove an event entirely -- a duplicate, a test row, one that should never
 * have been added. Its scores go with it (`scores.event_id` cascades), so
 * this is meant for a mistake caught early, not for erasing a round that
 * actually happened and was counted.
 */
export async function deleteEvent(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');
  if (!leagueId || !slug || !seasonId || !eventId) {
    throw new Error(
      'Missing leagueId, slug, seasonId, or eventId on the delete-event form.',
    );
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw new Error(`Deleting event ${eventId}: ${error.message}`);

  redirect(`/${slug}/admin/seasons/${seasonId}`);
}

/**
 * Adjust a season's handicap rule after it's already been created. Only ever
 * touches `seasons`, never rewrites a handicap that's already locked -- a
 * player locked under the old rule keeps their locked figure, the new rule
 * only governs whoever locks in after this changes.
 */
export async function updateSeasonRules(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const handicapBestOf = Number(formData.get('handicapBestOf'));
  const handicapWindowEvents = Number(formData.get('handicapWindowEvents'));
  if (
    !leagueId ||
    !slug ||
    !seasonId ||
    !Number.isFinite(handicapBestOf) ||
    handicapBestOf < 1 ||
    !Number.isFinite(handicapWindowEvents) ||
    handicapWindowEvents < 1
  ) {
    throw new Error('Missing or invalid fields on the season-rules form.');
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase
    .from('seasons')
    .update({
      handicap_best_of: handicapBestOf,
      handicap_window_events: handicapWindowEvents,
    })
    .eq('id', seasonId);
  if (error) throw new Error(`Updating season rules: ${error.message}`);

  redirect(`/${slug}/admin/seasons/${seasonId}`);
}

/**
 * Remove a season outright -- for the empty one created by mistake (wrong
 * year, a duplicate), not for a season with real history in it. Guarded to
 * only ever delete a season with zero events, so there's no path from this
 * button to losing recorded results.
 */
export async function deleteSeason(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  if (!leagueId || !slug || !seasonId) {
    throw new Error('Missing leagueId, slug, or seasonId on the delete-season form.');
  }
  await requireAdmin(leagueId, slug);

  const supabase = await createClient();
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId);
  if ((count ?? 0) > 0) {
    throw new Error(
      'This season has events in it -- remove them first, or this would delete their scores too.',
    );
  }

  const { error } = await supabase.from('seasons').delete().eq('id', seasonId);
  if (error) throw new Error(`Deleting season: ${error.message}`);

  redirect(`/${slug}/admin/seasons`);
}
