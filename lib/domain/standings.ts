import { denseRank } from './scoring';
import type { StandingRow } from './types';

/** A scored result feeding into a season total. */
export interface StandingsInput {
  playerId: string;
  eventPoints: number;
  /** Which event this was, so a dropped result can be pointed at. */
  eventId?: string;
  /** Position in the season, used only to break a tie between two equally
   *  bad results so the same one is dropped on every render. */
  sequence?: number;
  /** Whether the season's drop rule may set this result aside. Majors are
   *  passed as false: Seattle's rule spares them deliberately. Defaults to
   *  true, so a caller that knows nothing of the rule behaves as before. */
  droppable?: boolean;
}

/** How a season treats a player's worst results. */
export interface DropRule {
  /** How many of the worst droppable results to set aside. 0 disables it. */
  dropWorst: number;
  /** Droppable results a player needs before any drop applies at all. */
  minResults: number;
}

export const NO_DROP: DropRule = { dropWorst: 0, minResults: 0 };

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
 *
 * **The drop rule.** Seattle lets every player discard their worst finish of
 * the year. `rule` carries that; the default discards nothing, so Iowa is
 * untouched. Three things about it are deliberate:
 *
 * - A major is never a candidate. The caller marks those `droppable: false`;
 *   a major is meant to count.
 * - A missing entry is not a result. Only rows handed in can be dropped, so
 *   an event a player has yet to play is never mistaken for their worst --
 *   it is simply not on the card. A DNP is different: it is a recorded
 *   result carrying last place's points, and is droppable like any other.
 * - Nobody ends up with an empty card. Below `minResults` nothing is
 *   dropped, and the rule will never take a player's only counting result.
 *
 * `eventsPlayed` still counts every result, dropped or not: the player did
 * turn out, and a column that quietly shrank would misreport attendance.
 */
export function computeStandings(
  rows: StandingsInput[],
  rule: DropRule = NO_DROP,
): StandingRow[] {
  const byPlayer = new Map<string, StandingsInput[]>();
  for (const row of rows) {
    byPlayer.set(row.playerId, [...(byPlayer.get(row.playerId) ?? []), row]);
  }

  const list = Array.from(byPlayer.entries()).map(([playerId, results]) => {
    const dropped = worstToDrop(results, rule);
    const points = results
      .filter((r) => !dropped.includes(r))
      .reduce((sum, r) => sum + r.eventPoints, 0);

    return {
      playerId,
      totalPoints: round2(points),
      eventsPlayed: results.length,
      seasonRank: 0,
      droppedEventIds: dropped
        .map((d) => d.eventId)
        .filter((id): id is string => Boolean(id)),
    };
  });

  list.sort((a, b) => a.totalPoints - b.totalPoints);

  const rankOf = denseRank(list.map((l) => l.totalPoints));
  for (const row of list) {
    row.seasonRank = rankOf.get(row.totalPoints)!;
  }

  return list;
}

/**
 * Which of a player's results the rule sets aside.
 *
 * Worst first means most points, since a season is won on fewest. Two
 * equally bad results are separated by where they fell in the season,
 * earliest first -- an arbitrary tie-break, but a fixed one, so the same
 * cell is struck through on every render rather than flickering.
 */
function worstToDrop(results: StandingsInput[], rule: DropRule): StandingsInput[] {
  if (rule.dropWorst <= 0) return [];

  const candidates = results.filter((r) => r.droppable !== false);
  if (candidates.length < rule.minResults) return [];

  // Never discard someone's last counting result: a card has to keep at
  // least one figure on it to mean anything.
  const allowed = Math.min(rule.dropWorst, candidates.length - 1);
  if (allowed <= 0) return [];

  return [...candidates]
    .sort(
      (a, b) => b.eventPoints - a.eventPoints || (a.sequence ?? 0) - (b.sequence ?? 0),
    )
    .slice(0, allowed);
}
