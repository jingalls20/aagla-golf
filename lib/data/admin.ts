import { createClient } from '@/lib/supabase/server';
import { getSeasonRankOf } from '@/lib/data/season-rank';
import { computeHandicap, championshipHandicap } from '@/lib/domain/handicap';
import type { EventType, HistoricalRound } from '@/lib/domain/types';

/**
 * Admin-only reads. Kept separate from queries.ts because these answer "who
 * is this and what are they allowed to do" rather than "what does this screen
 * show" -- a different kind of question, worth not mixing in.
 */

export type MemberRole = 'owner' | 'admin' | 'member';

/**
 * The signed-in user's role in this league, or null if they aren't signed in
 * or aren't a member. `league_members_read` (0003_rls.sql) lets any member
 * read every row for their league, not just their own -- so this filters by
 * user id itself rather than relying on RLS to do it.
 */
export async function getMembership(leagueId: string): Promise<MemberRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('league_members')
    .select('role')
    .eq('league_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle();

  return (data as unknown as { role: MemberRole } | null)?.role ?? null;
}

export async function isLeagueAdmin(leagueId: string): Promise<boolean> {
  const role = await getMembership(leagueId);
  return role === 'owner' || role === 'admin';
}

export interface SeasonRules {
  id: string;
  year: number;
  handicapBestOf: number;
  handicapWindowEvents: number;
}

/** A season's id and handicap rules, by league and year. */
export async function getSeasonRow(leagueId: string, year: number): Promise<SeasonRules | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('id, year, handicap_best_of, handicap_window_events')
    .eq('league_id', leagueId)
    .eq('year', year)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    year: number;
    handicap_best_of: number;
    handicap_window_events: number;
  };
  return {
    id: row.id,
    year: row.year,
    handicapBestOf: row.handicap_best_of,
    handicapWindowEvents: row.handicap_window_events,
  };
}

export interface EntryHandicap {
  fs: number;
  /** False means this is a preview of what WOULD lock in, not yet committed. */
  locked: boolean;
}

/**
 * Every active player's handicap for an event's score-entry screen: the
 * locked season figure where one exists, or a live preview of what locking
 * it now would produce, computed the same way `lockedHandicapFor` in
 * `lib/actions/scores.ts` actually locks it. For a Championship event, the
 * staggered-start reduction is folded in so the number shown is the one that
 * will actually apply to that round.
 *
 * Read-only: unlike `lockedHandicapFor`, this never writes to `handicaps`.
 * It exists so an admin can see the number *before* deciding to save a score
 * against it, not just after.
 */
export async function getEntryHandicaps(args: {
  leagueId: string;
  seasonId: string;
  priorYear: number;
  bestOf: number;
  windowEvents: number;
  eventType: EventType;
  playerIds: string[];
}): Promise<Map<string, EntryHandicap>> {
  const supabase = await createClient();

  const { data: lockedRows } = await supabase
    .from('handicaps')
    .select('player_id, fs')
    .eq('season_id', args.seasonId);
  const locked = new Map<string, number>(
    ((lockedRows ?? []) as unknown as { player_id: string; fs: string | number }[]).map((r) => [
      r.player_id,
      Number(r.fs),
    ]),
  );

  const unlockedIds = args.playerIds.filter((id) => !locked.has(id));

  const projected = new Map<string, number>();
  if (unlockedIds.length > 0) {
    const { data: priorScores } = await supabase
      .from('scores')
      .select(
        'player_id, true_score, events!inner(name, event_type, sequence, seasons!inner(year))',
      )
      .eq('league_id', args.leagueId)
      .in('player_id', unlockedIds);
    const rows = (priorScores ?? []) as unknown as {
      player_id: string;
      true_score: string | number | null;
      events: {
        name: string | null;
        event_type: EventType;
        sequence: number;
        seasons: { year: number } | { year: number }[];
      };
    }[];

    const roundsByPlayer = new Map<string, HistoricalRound[]>();
    for (const r of rows) {
      if (r.true_score === null || r.events.event_type === 'championship') continue;
      const y = Array.isArray(r.events.seasons) ? r.events.seasons[0].year : r.events.seasons.year;
      if (y !== args.priorYear) continue;
      const list = roundsByPlayer.get(r.player_id) ?? [];
      list.push({
        eventId: '',
        eventName: r.events.name,
        eventType: r.events.event_type,
        sequence: r.events.sequence,
        trueScore: Number(r.true_score),
      });
      roundsByPlayer.set(r.player_id, list);
    }

    for (const playerId of unlockedIds) {
      const rounds = roundsByPlayer.get(playerId) ?? [];
      const result = computeHandicap(rounds, args.bestOf, args.windowEvents, args.priorYear);
      projected.set(playerId, result.fs);
    }
  }

  const seasonRankOf =
    args.eventType === 'championship'
      ? await getSeasonRankOf(args.leagueId, args.seasonId)
      : new Map<string, number>();

  const result = new Map<string, EntryHandicap>();
  for (const playerId of args.playerIds) {
    const isLocked = locked.has(playerId);
    let fs = isLocked ? locked.get(playerId)! : (projected.get(playerId) ?? 0);
    if (args.eventType === 'championship') {
      fs = championshipHandicap(fs, seasonRankOf.get(playerId) ?? null);
    }
    result.set(playerId, { fs, locked: isLocked });
  }
  return result;
}
