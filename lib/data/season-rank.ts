import { createClient } from '@/lib/supabase/server';
import { computeStandings } from '@/lib/domain/standings';
import type { EventType } from '@/lib/domain/types';

/**
 * Season-to-date standings rank for every player with recorded points this
 * season, excluding the Championship itself -- it never contributes points,
 * so it can't affect its own staggered-start reduction (see
 * `championshipHandicap`).
 *
 * Shared by the score-entry action (to compute the reduction when locking a
 * Championship handicap) and the admin score-entry screen (to preview it
 * before saving).
 */
export async function getSeasonRankOf(
  leagueId: string,
  seasonId: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('scores')
    .select('player_id, event_points, events!inner(event_type, season_id)')
    .eq('league_id', leagueId);
  const rows = (data ?? []) as unknown as {
    player_id: string;
    event_points: string | number | null;
    events:
      | { event_type: EventType; season_id: string }
      | { event_type: EventType; season_id: string }[];
  }[];
  const forStandings = rows
    .map((r) => {
      const ev = Array.isArray(r.events) ? r.events[0] : r.events;
      return {
        playerId: r.player_id,
        eventType: ev.event_type,
        seasonId: ev.season_id,
        eventPoints: r.event_points,
      };
    })
    .filter(
      (r) =>
        r.seasonId === seasonId &&
        r.eventType !== 'championship' &&
        r.eventPoints !== null,
    )
    .map((r) => ({ playerId: r.playerId, eventPoints: Number(r.eventPoints) }));
  const standings = computeStandings(forStandings);
  return new Map(standings.map((s) => [s.playerId, s.seasonRank]));
}
