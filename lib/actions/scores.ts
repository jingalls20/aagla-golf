'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLeagueAdmin } from '@/lib/data/admin';
import { getSeasonRankOf } from '@/lib/data/season-rank';
import { recomputeEventResults } from '@/lib/domain/scoring';
import { computeHandicap, championshipHandicap } from '@/lib/domain/handicap';
import type { DomainScore, EventType, HistoricalRound, PointsTable } from '@/lib/domain/types';

/**
 * Score entry, in one transactional-feeling submit rather than the old app's
 * one-row-at-a-time save.
 *
 * The steps, in order:
 *  1. Confirm the signed-in user actually administers this league. RLS would
 *     reject the writes anyway, but a clear redirect beats a raw policy error.
 *  2. Upsert every score the form submitted, locking each player's handicap
 *     for the season on first use (computed from their prior season, same
 *     rule as computeHandicap/championshipHandicap) if it isn't locked yet.
 *  3. Upsert a `dnp` row for every player checked off as "did not play" --
 *     no true score, no handicap lock, since a DNP round never happened.
 *  4. Recompute the whole event -- place, net score, points, and the
 *     no-show/DNP last-place placeholders -- from every score now on record
 *     for it, not just the ones this submit touched. Two admins editing the
 *     same event a week apart should not fight the recompute.
 */
export async function saveEventScores(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const year = Number(formData.get('year'));
  const courseDifferential = Number(formData.get('courseDifferential') ?? 0) || 0;

  if (!leagueId || !eventId || !slug) {
    throw new Error('Missing leagueId, eventId, or slug on score entry form.');
  }
  if (!(await isLeagueAdmin(leagueId))) {
    redirect(`/${slug}`);
  }

  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select('id, event_type, season_id')
    .eq('id', eventId)
    .single();
  if (!event) throw new Error(`Event ${eventId} not found.`);
  const eventType = (event as unknown as { event_type: EventType }).event_type;
  const seasonId = (event as unknown as { season_id: string }).season_id;

  const { data: season } = await supabase
    .from('seasons')
    .select('id, year, handicap_best_of, handicap_window_events, points_table')
    .eq('id', seasonId)
    .single();
  if (!season) throw new Error(`Season ${seasonId} not found.`);
  const seasonRow = season as unknown as {
    id: string;
    year: number;
    handicap_best_of: number;
    handicap_window_events: number;
    points_table: PointsTable;
  };

  const { data: activePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('league_id', leagueId)
    .eq('status', 'active');
  const activePlayerIds = ((activePlayers ?? []) as unknown as { id: string }[]).map(
    (p) => p.id,
  );

  // Players checked off as "did not play". Field names are `dnp_<playerId>`;
  // a DNP always wins over anything typed in that player's score field --
  // the score is ignored rather than saved alongside a contradictory DNP.
  const dnpPlayerIds = new Set<string>();
  for (const key of formData.keys()) {
    if (key.startsWith('dnp_')) dnpPlayerIds.add(key.slice('dnp_'.length));
  }

  // Entries the form actually filled in. Field names are `score_<playerId>`;
  // a blank input means "leave this player alone", not "score of 0".
  const entries: { playerId: string; trueScore: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('score_')) continue;
    const playerId = key.slice('score_'.length);
    if (dnpPlayerIds.has(playerId)) continue;
    const raw = String(value).trim();
    if (raw === '') continue;
    const trueScore = Number(raw);
    if (Number.isNaN(trueScore)) continue;
    entries.push({ playerId, trueScore });
  }
  if (entries.length === 0 && dnpPlayerIds.size === 0) {
    redirect(`/${slug}/admin?year=${year}&event=${eventId}`);
  }

  // Standings-to-date, for the Championship's staggered start.
  const seasonRankOf =
    eventType === 'championship' ? await getSeasonRankOf(leagueId, seasonId) : new Map<string, number>();

  for (const entry of entries) {
    const fsApplied = await lockedHandicapFor({
      leagueId,
      seasonId,
      playerId: entry.playerId,
      priorYear: seasonRow.year - 1,
      bestOf: seasonRow.handicap_best_of,
      windowEvents: seasonRow.handicap_window_events,
      eventType,
      seasonRank: seasonRankOf.get(entry.playerId) ?? null,
    });

    const { error } = await supabase.from('scores').upsert(
      {
        league_id: leagueId,
        event_id: eventId,
        player_id: entry.playerId,
        true_score: entry.trueScore,
        fs_applied: fsApplied,
        course_differential: courseDifferential,
        source: 'new',
      },
      { onConflict: 'event_id,player_id' },
    );
    if (error) throw new Error(`Saving score for player ${entry.playerId}: ${error.message}`);
  }

  // DNP is a plain fact, not a round played -- no handicap lookup or lock,
  // no course differential. It stands on its own until the admin overwrites
  // it with a real score or unchecks the box.
  for (const playerId of dnpPlayerIds) {
    const { error } = await supabase.from('scores').upsert(
      {
        league_id: leagueId,
        event_id: eventId,
        player_id: playerId,
        true_score: null,
        fs_applied: null,
        course_differential: 0,
        source: 'dnp',
      },
      { onConflict: 'event_id,player_id' },
    );
    if (error) throw new Error(`Marking player ${playerId} DNP: ${error.message}`);
  }

  // A newly built event starts life as 'scheduled'; this submit is the first
  // recorded outcome for it, so it's happened now. Never resurrects a
  // deliberately cancelled event.
  await supabase.from('events').update({ status: 'played' }).eq('id', eventId).neq('status', 'cancelled');

  await recomputeAndPersist({ supabase, leagueId, eventId, eventType, pointsTable: seasonRow.points_table, activePlayerIds });

  redirect(`/${slug}/admin?year=${year}&event=${eventId}&saved=1`);
}

/**
 * The season handicap, locked on first use and held steady after that --
 * same rule the Handicaps screen documents. A Championship round additionally
 * applies the staggered-start reduction on top of the locked figure; the
 * locked figure itself is never reduced, so next season's calculation still
 * starts from what the player actually carried all year.
 */
async function lockedHandicapFor(args: {
  leagueId: string;
  seasonId: string;
  playerId: string;
  priorYear: number;
  bestOf: number;
  windowEvents: number;
  eventType: EventType;
  seasonRank: number | null;
}): Promise<number> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('handicaps')
    .select('fs')
    .eq('season_id', args.seasonId)
    .eq('player_id', args.playerId)
    .maybeSingle();

  let lockedFs: number;
  if (existing) {
    lockedFs = Number((existing as unknown as { fs: number | string }).fs);
  } else {
    const { data: priorScores } = await supabase
      .from('scores')
      .select('true_score, events!inner(name, event_type, sequence, season_id, seasons!inner(year))')
      .eq('league_id', args.leagueId)
      .eq('player_id', args.playerId);
    const rows = (priorScores ?? []) as unknown as {
      true_score: string | number | null;
      events: {
        name: string | null;
        event_type: EventType;
        sequence: number;
        seasons: { year: number } | { year: number }[];
      };
    }[];
    const rounds: HistoricalRound[] = rows
      .filter((r) => r.true_score !== null && r.events.event_type !== 'championship')
      .filter((r) => {
        const y = Array.isArray(r.events.seasons) ? r.events.seasons[0].year : r.events.seasons.year;
        return y === args.priorYear;
      })
      .map((r) => ({
        eventId: '',
        eventName: r.events.name,
        eventType: r.events.event_type,
        sequence: r.events.sequence,
        trueScore: Number(r.true_score),
      }));

    const result = computeHandicap(rounds, args.bestOf, args.windowEvents, args.priorYear);
    lockedFs = result.fs;

    const { error } = await supabase.from('handicaps').insert({
      league_id: args.leagueId,
      season_id: args.seasonId,
      player_id: args.playerId,
      fs: lockedFs,
      note: result.note || null,
      is_override: false,
    });
    // A concurrent lock (two admins entering scores at once) loses the race
    // gracefully -- re-read whatever the other request wrote rather than fail.
    if (error) {
      const { data: raced } = await supabase
        .from('handicaps')
        .select('fs')
        .eq('season_id', args.seasonId)
        .eq('player_id', args.playerId)
        .maybeSingle();
      if (raced) lockedFs = Number((raced as unknown as { fs: number | string }).fs);
    }
  }

  return args.eventType === 'championship'
    ? championshipHandicap(lockedFs, args.seasonRank)
    : lockedFs;
}

/**
 * Recompute an event from every score currently on record for it, and write
 * the outcome back: place, net score, and points for played rounds; last-place
 * rows for DNPs (immediately) and no-shows (once half the roster has played);
 * deletion of any automatic no-show placeholder that's no longer earned.
 */
async function recomputeAndPersist(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  leagueId: string;
  eventId: string;
  eventType: EventType;
  pointsTable: PointsTable;
  activePlayerIds: string[];
}): Promise<void> {
  const { supabase, leagueId, eventId, eventType, pointsTable, activePlayerIds } = args;

  const { data: currentScores } = await supabase
    .from('scores')
    .select('player_id, true_score, fs_applied, course_differential, source')
    .eq('event_id', eventId);
  const domainScores: DomainScore[] = ((currentScores ?? []) as unknown as {
    player_id: string;
    true_score: string | number | null;
    fs_applied: string | number | null;
    course_differential: string | number | null;
    source: DomainScore['source'];
  }[]).map((r) => ({
    playerId: r.player_id,
    trueScore: r.true_score === null ? null : Number(r.true_score),
    fsApplied: r.fs_applied === null ? null : Number(r.fs_applied),
    courseDifferential: Number(r.course_differential ?? 0),
    source: r.source,
  }));

  const result = recomputeEventResults({
    eventType,
    pointsTable,
    scores: domainScores,
    activePlayerIds,
  });

  for (const r of result.played) {
    const { error } = await supabase
      .from('scores')
      .update({ net_score: r.netScore, place: r.place, event_points: r.eventPoints })
      .eq('event_id', eventId)
      .eq('player_id', r.playerId);
    if (error) throw new Error(`Writing back result for player ${r.playerId}: ${error.message}`);
  }

  for (const r of result.missed) {
    // r.source is 'dnp' for an admin-asserted DNP or 'missed' for the
    // automatic no-show placeholder -- write back whichever it actually is,
    // not a hardcoded value, so a DNP row stays a DNP row on every recompute.
    const { error } = await supabase.from('scores').upsert(
      {
        league_id: leagueId,
        event_id: eventId,
        player_id: r.playerId,
        true_score: null,
        fs_applied: null,
        course_differential: 0,
        net_score: null,
        place: r.place,
        event_points: r.eventPoints,
        source: r.source,
      },
      { onConflict: 'event_id,player_id' },
    );
    if (error) throw new Error(`Writing ${r.source} placeholder for player ${r.playerId}: ${error.message}`);
  }

  if (result.clearMissedFor.length > 0) {
    const { error } = await supabase
      .from('scores')
      .delete()
      .eq('event_id', eventId)
      .in('player_id', result.clearMissedFor);
    if (error) throw new Error(`Clearing stale missed placeholders: ${error.message}`);
  }
}
