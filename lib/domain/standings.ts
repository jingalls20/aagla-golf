import { denseRank } from './scoring';
import type { StandingRow } from './types';

/** A scored result feeding into a season total. */
export interface StandingsInput {
  playerId: string;
  eventPoints: number;
}

/**
 * Round to two decimals.
 *
 * The points table deals in halves (1.5, 2.5, ...), so summing a season's worth
 * of them in binary floating point can land on 12.000000000000002. That value
 * is not equal to another player's 12, which would silently break a tie that
 * should have been shared. Rounding before ranking keeps ties genuinely tied.
 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Season standings from a season's scored results.
 *
 * Ported from `getSeasonStandings` in the Apps Script `Code.gs`.
 *
 * **Lower is better.** A season is won by accumulating the fewest points, since
 * 1st place in an event is worth 0. Rank 1 is therefore the smallest total.
 *
 * **Championship results must not be passed in.** They are worth zero season
 * points by design; including them would inflate `eventsPlayed` without
 * affecting totals, which misrepresents participation. Filtering is the
 * caller's job -- this function ranks whatever it is given.
 */
export function computeStandings(rows: StandingsInput[]): StandingRow[] {
  const totals = new Map<string, { points: number; events: number }>();

  for (const row of rows) {
    const current = totals.get(row.playerId) ?? { points: 0, events: 0 };
    current.points += row.eventPoints;
    current.events += 1;
    totals.set(row.playerId, current);
  }

  const list = Array.from(totals.entries()).map(([playerId, t]) => ({
    playerId,
    totalPoints: round2(t.points),
    eventsPlayed: t.events,
    seasonRank: 0,
  }));

  list.sort((a, b) => a.totalPoints - b.totalPoints);

  const rankOf = denseRank(list.map((l) => l.totalPoints));
  for (const row of list) {
    row.seasonRank = rankOf.get(row.totalPoints)!;
  }

  return list;
}
