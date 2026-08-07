import { pointsForPlace } from './points';
import type { DomainScore, EventType, PointsTable, ScoreResult } from './types';

/**
 * Net score for one round.
 *
 * `floor` is applied to the handicap-adjusted score *before* the course
 * differential is added, exactly as the Apps Script version did. The order
 * matters: flooring the whole expression instead would shift results whenever
 * a course differential is in play, and would quietly disagree with a decade
 * of recorded league history.
 */
export function netScoreFor(score: {
  trueScore: number;
  fsApplied: number | null;
  courseDifferential: number;
}): number {
  return (
    Math.floor(score.trueScore - (score.fsApplied ?? 0)) +
    (score.courseDifferential || 0)
  );
}

/**
 * Dense ranking, ascending: lowest value is 1st, ties share a place, and the
 * next distinct value takes the *next* place rather than skipping.
 *
 * So nets of 70, 72, 72, 74 place 1, 2, 2, 3 -- not 1, 2, 2, 4. This is the
 * league's convention and it is why two players tying for 2nd does not push
 * the next player down to 4th.
 */
export function denseRank(values: number[]): Map<number, number> {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  return new Map<number, number>(
    unique.map((value, index): [number, number] => [value, index + 1]),
  );
}

export interface RecomputeInput {
  eventType: EventType;
  pointsTable: PointsTable;
  /** Every score row currently recorded for this event: played, missed, or DNP. */
  scores: DomainScore[];
  /** Player IDs on the active roster at the time of the recompute. */
  activePlayerIds: string[];
}

export interface RecomputeOutput {
  /** Results for players who posted a score. */
  played: ScoreResult[];
  /**
   * Last-place results for players who did not post a score: both players an
   * admin explicitly marked DNP (`source: 'dnp'`, included immediately, at
   * any point in the event) and, once enough of the field has played, the
   * rest of the roster who stayed silent (`source: 'missed'`, synthetic).
   */
  missed: ScoreResult[];
  /**
   * Player IDs whose existing 'missed' placeholder should be deleted, because
   * the event no longer meets the threshold (a score was removed, or the roster
   * grew). Never includes 'dnp' rows -- those are an admin's explicit word and
   * only change when the admin changes them.
   */
  clearMissedFor: string[];
  /**
   * Whether enough of the field is accounted for -- played or explicitly
   * DNP'd -- for the *remaining* silent players to be treated as no-shows.
   * Surfaced so the UI can explain why an event's results look provisional.
   */
  thresholdMet: boolean;
}

/**
 * Recompute every player's place and points for a single event.
 *
 * Ported from `recomputeEventResults_` in the Apps Script `Code.gs`, plus one
 * rule that script never had to express: an admin-asserted DNP. Three rules
 * live here that are not obvious from the output alone:
 *
 * **The half-the-roster threshold.** A player who never posts a score or an
 * explicit DNP is eventually treated as having played and finished last --
 * but only once at least half the active roster is accounted for (scored or
 * DNP'd). Before that, the event is still considered in progress and silence
 * is not penalized. Without the threshold, the first player to enter a score
 * would instantly saddle everyone else with a last-place finish.
 *
 * **DNP is immediate and sticky.** Unlike the automatic no-show placeholder,
 * an explicit DNP applies the moment it's entered, regardless of the
 * threshold, and is never auto-cleared -- it only changes if the admin enters
 * an actual score or removes it.
 *
 * **Everyone missing shares one place.** All no-shows and DNPs tie for one
 * place worse than the worst actual score, and all take the points that place
 * is worth. They are not ranked against each other.
 *
 * This function decides; it does not write. The caller persists the result.
 */
export function recomputeEventResults(input: RecomputeInput): RecomputeOutput {
  const { eventType, pointsTable, scores, activePlayerIds } = input;

  const scored = scores.filter(
    (s): s is DomainScore & { trueScore: number } =>
      s.trueScore !== null && s.trueScore !== undefined,
  );
  const dnp = scores.filter((s) => s.source === 'dnp');

  // Nothing to rank yet. Leave the event entirely alone rather than assigning
  // a whole field last place off a single missing entry.
  if (scored.length === 0 && dnp.length === 0) {
    return { played: [], missed: [], clearMissedFor: [], thresholdMet: false };
  }

  const withNet = scored.map((s) => ({ score: s, netScore: netScoreFor(s) }));
  const placeOf = denseRank(withNet.map((r) => r.netScore));

  const played: ScoreResult[] = withNet.map(({ score, netScore }) => {
    const place = placeOf.get(netScore)!;
    return {
      playerId: score.playerId,
      netScore,
      place,
      eventPoints: pointsForPlace(pointsTable, eventType, place),
      source: score.source === 'historical' ? 'historical' : 'new',
    };
  });

  // Everyone not ranked above shares one place, worse than the worst actual
  // score. If nobody has played at all yet (an event that is DNP so far),
  // there is no "worst played place" to sit behind, so the shared place is 1st.
  const worstPlace = played.length > 0 ? Math.max(...played.map((r) => r.place)) : 0;
  const lastPlace = worstPlace + 1;
  const lastPlacePoints = pointsForPlace(pointsTable, eventType, lastPlace);

  // An admin's DNP counts at any point in the event, threshold or not.
  const dnpResults: ScoreResult[] = dnp.map((s) => ({
    playerId: s.playerId,
    netScore: null,
    place: lastPlace,
    eventPoints: lastPlacePoints,
    source: 'dnp' as const,
  }));

  // Played or explicitly DNP'd -- either way, that player is accounted for
  // and counts toward the threshold that turns the rest of the roster's
  // silence into an automatic no-show.
  const accountedForIds = new Set([
    ...scored.map((s) => s.playerId),
    ...dnp.map((s) => s.playerId),
  ]);
  const missingPlayerIds = activePlayerIds.filter((id) => !accountedForIds.has(id));

  // Strictly "at least half", matching the original `>= length / 2`. With an
  // odd roster of 9, 5 accounted-for players meet the threshold and 4 do not.
  const thresholdMet =
    activePlayerIds.length > 0 &&
    scored.length + dnp.length >= activePlayerIds.length / 2;

  if (!thresholdMet || missingPlayerIds.length === 0) {
    // Any automatic placeholder previously written is now unearned. Name the
    // players whose 'missed' rows should be removed -- 'dnp' rows are never
    // named here, since only the admin retires those.
    const existingMissed = scores
      .filter((s) => s.source === 'missed')
      .map((s) => s.playerId);
    return { played, missed: dnpResults, clearMissedFor: existingMissed, thresholdMet };
  }

  const missed: ScoreResult[] = missingPlayerIds.map((playerId) => ({
    playerId,
    netScore: null,
    place: lastPlace,
    eventPoints: lastPlacePoints,
    source: 'missed' as const,
  }));

  return {
    played,
    missed: [...missed, ...dnpResults],
    clearMissedFor: [],
    thresholdMet,
  };
}
