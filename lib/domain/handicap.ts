import type { HandicapResult, HistoricalRound } from './types';

/**
 * Handicaps are whole strokes, never fractional -- unlike points, which
 * legitimately deal in halves. Every path that produces or re-reads an `fs`
 * value funnels through this so a value is never left carrying a decimal a
 * later display or calculation might trust.
 */
function roundHandicap(value: number): number {
  return Math.round(value);
}

/**
 * Compute a player's handicap ("free strokes") from a set of prior rounds.
 *
 * Ported from `computeHandicapFromYear_` in the Apps Script `Code.gs`.
 *
 * The rule: take the player's most recent `windowEvents` Event/Major rounds
 * from the source season, keep the best `bestOf` of them, and average their
 * true scores. Most recent first narrows it to current form; best-of then
 * discards the blow-up rounds, so one disastrous afternoon does not inflate a
 * player's handicap for a whole year.
 *
 * Championship rounds are excluded by the caller: they are played off a
 * *reduced* handicap (see `championshipHandicap`), so feeding them back in
 * would compound the reduction year over year.
 *
 * A player with no qualifying history gets 0, with a note saying so. Zero is
 * the correct neutral default -- it means "no strokes given" -- but it is also
 * indistinguishable from a genuinely scratch player, which is exactly why an
 * admin override exists.
 */
export function computeHandicap(
  rounds: HistoricalRound[],
  bestOf: number,
  windowEvents: number,
  sourceYearLabel: string | number,
): HandicapResult {
  if (bestOf < 1 || windowEvents < 1) {
    throw new Error(
      `Invalid handicap rules: bestOf=${bestOf}, windowEvents=${windowEvents}. Both must be at least 1.`,
    );
  }

  // Chronological, then take the tail: the most recent `windowEvents` rounds.
  const chronological = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const considered = chronological.slice(
    Math.max(0, chronological.length - windowEvents),
  );

  if (considered.length === 0) {
    return {
      fs: 0,
      roundsUsed: [],
      consideredCount: 0,
      note: `No ${sourceYearLabel} rounds found; defaults to 0.`,
    };
  }

  const byScore = [...considered].sort((a, b) => a.trueScore - b.trueScore);
  const take = Math.min(bestOf, byScore.length);
  const best = byScore.slice(0, take);
  const fs = roundHandicap(best.reduce((sum, r) => sum + r.trueScore, 0) / best.length);

  const note =
    considered.length < windowEvents
      ? `Only ${considered.length} of ${sourceYearLabel}'s round(s) available (wanted ${windowEvents}).`
      : '';

  return { fs, roundsUsed: best, consideredCount: considered.length, note };
}

/**
 * The handicap a player actually plays off in a Championship event.
 *
 * Ported from `getChampionshipHandicap` in the Apps Script `Code.gs`.
 *
 * This is the league's staggered start. The season leader (rank 1) plays their
 * full handicap; rank 2 gives up one stroke, rank 3 gives up two, and so on.
 * The season's best players therefore start the Championship at a
 * disadvantage proportional to how well they played all year, which keeps the
 * final event live for the whole field.
 *
 * A player with no season standing takes no reduction. The result is allowed
 * to go negative -- a player who already gives strokes back (a negative
 * season handicap) and is reduced further ends up owing even more, same as
 * any other stroke deducted from their score. Flooring at zero would let a
 * strong player in a low season rank dodge the reduction they're supposed to
 * feel most.
 *
 * @param seasonRank 1-based season rank, or null if the player has no standing.
 */
export function championshipHandicap(
  lockedFs: number,
  seasonRank: number | null,
): number {
  if (seasonRank === null) return roundHandicap(lockedFs);
  const reduction = Math.max(0, seasonRank - 1);
  return roundHandicap(lockedFs - reduction);
}

/**
 * Human-readable explanation of how a handicap was arrived at.
 *
 * The Handicaps screen shows this next to every figure. Players trust a number
 * they can see the working for, and "why is my handicap 4.3?" stops being a
 * question anyone has to ask an admin.
 */
export function describeHandicap(
  result: HandicapResult,
  sourceYearLabel: string | number,
): string {
  if (result.roundsUsed.length === 0) {
    return `No ${sourceYearLabel} rounds recorded yet, so this defaults to 0.`;
  }

  const scores = result.roundsUsed.map((r) => r.trueScore).join(', ');
  const base =
    `Best ${result.roundsUsed.length} of last ${result.consideredCount} ` +
    `${sourceYearLabel} round(s): ${scores} → average ${roundHandicap(result.fs)}.`;

  return result.note ? `${base} ${result.note}` : base;
}
