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
  /** Every score row currently recorded for this event, played or missed. */
  scores: DomainScore[];
  /** Player IDs on the active roster at the time of the recompute. */
  activePlayerIds: string[];
}

export interface RecomputeOutput {
  /** Results for players who posted a score. */
  played: ScoreResult[];
  /**
   * Synthetic last-place results for active players who did not post a score,
   * once enough of the field has played. Empty while the event is still open.
   */
  missed: ScoreResult[];
  /**
   * Player IDs whose existing 'missed' placeholder should be deleted, because
   * the event no longer meets the threshold (a score was removed, or the roster
   * grew). Without this the penalty would stick around after it stopped
   * applying.
   */
  clearMissedFor: string[];
  /**
   * Whether enough of the field has played for no-shows to be penalized.
   * Surfaced so the UI can explain why an event's results look provisional.
   */
  thresholdMet: boolean;
}

/**
 * Recompute every player's place and points for a single event.
 *
 * Ported from `recomputeEventResults_` in the Apps Script `Code.gs`. Two rules
 * live here that are not obvious from the output alone:
 *
 * **The half-the-roster threshold.** A player who never posts a score is
 * eventually treated as having played and finished last -- but only once at
 * least half the active roster has recorded a score. Before that, the event is
 * still considered in progress and no-shows are not penalized. Without the
 * threshold, the first player to enter a score would instantly saddle everyone
 * else with a last-place finish.
 *
 * **Everyone missing shares one place.** All no-shows tie for one place worse
 * than the worst actual score, and all take the points that place is worth.
 * They are not ranked against each other.
 *
 * This function decides; it does not write. The caller persists the result.
 */
export function recomputeEventResults(input: RecomputeInput): RecomputeOutput {
  const { eventType, pointsTable, scores, activePlayerIds } = input;

  const scored = scores.filter(
    (s): s is DomainScore & { trueScore: number } =>
      s.trueScore !== null && s.trueScore !== undefined,
  );

  // Nothing to rank yet. Leave the event entirely alone rather than assigning
  // a whole field last place off a single missing entry.
  if (scored.length === 0) {
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

  const worstPlace = Math.max(...played.map((r) => r.place));

  const scoredPlayerIds = new Set(scored.map((s) => s.playerId));
  const missingPlayerIds = activePlayerIds.filter(
    (id) => !scoredPlayerIds.has(id),
  );

  // Strictly "at least half", matching the original `>= length / 2`. With an
  // odd roster of 9, 5 scores meet the threshold and 4 do not.
  const thresholdMet =
    activePlayerIds.length > 0 && scored.length >= activePlayerIds.length / 2;

  if (!thresholdMet || missingPlayerIds.length === 0) {
    // Any placeholder previously written is now unearned. Name the players
    // whose rows should be removed.
    const existingMissed = scores
      .filter((s) => s.source === 'missed')
      .map((s) => s.playerId);
    return { played, missed: [], clearMissedFor: existingMissed, thresholdMet };
  }

  const missedPlace = worstPlace + 1;
  const missedPoints = pointsForPlace(pointsTable, eventType, missedPlace);

  const missed: ScoreResult[] = missingPlayerIds.map((playerId) => ({
    playerId,
    netScore: null,
    place: missedPlace,
    eventPoints: missedPoints,
    source: 'missed' as const,
  }));

  return { played, missed, clearMissedFor: [], thresholdMet };
}
