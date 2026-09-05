import type { HandicapResult, HistoricalRound } from './types';
import { count, word } from './prose';

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
      ? `Only ${count(considered.length, 'round')} from ${sourceYearLabel} to draw on, against a window of ${windowEvents}.`
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

  // "round(s)" was the giveaway that nobody had read this sentence aloud.
  // It is a short line, but it sits under every player's handicap and it is
  // held to the same standard as the summaries.
  const scores = result.roundsUsed.map((r) => r.trueScore).join(', ');
  const base =
    `The best ${word(result.roundsUsed.length)} of the last ` +
    `${count(result.consideredCount, 'round')} played in ${sourceYearLabel} — ` +
    `${scores} — average ${roundHandicap(result.fs)}.`;

  return result.note ? `${base} ${result.note}` : base;
}

/** A window round, marked with whether it counted toward the figure. */
export interface ConsideredRound extends HistoricalRound {
  used: boolean;
}

/**
 * Everything behind one handicap: what counted, what didn't, and what the
 * figure would have been under other rules.
 *
 * The alternatives exist to answer "how solid is this number?". A handicap
 * built on one exceptional round moves a long way when that round is removed;
 * one built on a tight cluster barely moves at all. Same figure, very
 * different confidence, and nothing on the old screen distinguished them.
 */
export interface HandicapBreakdown extends HandicapResult {
  /** The window -- most recent `windowEvents` rounds -- each marked used. */
  considered: ConsideredRound[];
  /** Prior-season rounds that fell outside the window entirely. */
  outsideWindow: HistoricalRound[];
  /** Average of every round in the window rather than only the best N. */
  allConsideredFs: number | null;
  /** The figure with the single best round discarded. */
  withoutBestFs: number | null;
  /** Worst minus best across the window. */
  spread: number | null;
  /** Population standard deviation across the window, to one decimal. */
  stdDev: number | null;
  consistency: Consistency | null;
}

export type Consistency = 'steady' | 'variable' | 'streaky';

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Population standard deviation, not sample.
 *
 * The window is not a sample drawn from some larger set of rounds a player
 * might have played -- it is the entire set the rule looks at. Bessel's
 * correction would be answering a question nobody asked.
 */
export function stdDevOf(scores: number[]): number | null {
  if (scores.length < 2) return null;
  const m = mean(scores);
  const variance = mean(scores.map((s) => (s - m) ** 2));
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Plain-language reading of a player's spread.
 *
 * Thresholds are in strokes relative to par and deliberately coarse. The point
 * is to separate "you can predict this player's afternoon" from "you cannot",
 * not to imply the underlying number is precise enough to rank people by.
 */
export function consistencyOf(stdDev: number | null): Consistency | null {
  if (stdDev === null) return null;
  if (stdDev < 3) return 'steady';
  if (stdDev < 6) return 'variable';
  return 'streaky';
}

export function handicapBreakdown(
  rounds: HistoricalRound[],
  bestOf: number,
  windowEvents: number,
  sourceYearLabel: string | number,
): HandicapBreakdown {
  const result = computeHandicap(rounds, bestOf, windowEvents, sourceYearLabel);

  const chronological = [...rounds].sort((a, b) => a.sequence - b.sequence);
  const cut = Math.max(0, chronological.length - windowEvents);
  const window = chronological.slice(cut);
  const outsideWindow = chronological.slice(0, cut);

  // Mark by identity within the window rather than by score, so two rounds of
  // the same score don't both light up when only one of them counted.
  const usedIdx = new Set<number>();
  const byScore = window
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.trueScore - b.r.trueScore);
  for (const { i } of byScore.slice(0, Math.min(bestOf, byScore.length))) {
    usedIdx.add(i);
  }
  const considered: ConsideredRound[] = window.map((r, i) => ({
    ...r,
    used: usedIdx.has(i),
  }));

  const scores = window.map((r) => r.trueScore);
  const allConsideredFs = scores.length ? roundHandicap(mean(scores)) : null;

  // Drop the single best round, then re-apply the ordinary rule. If that
  // leaves fewer rounds than `bestOf`, the rule already tolerates a short
  // window, so this stays meaningful rather than becoming undefined.
  let withoutBestFs: number | null = null;
  if (window.length > 1) {
    const sorted = [...window].sort((a, b) => a.trueScore - b.trueScore);
    withoutBestFs = computeHandicap(
      sorted.slice(1),
      bestOf,
      windowEvents,
      sourceYearLabel,
    ).fs;
  }

  const stdDev = stdDevOf(scores);

  return {
    ...result,
    considered,
    outsideWindow,
    allConsideredFs,
    withoutBestFs,
    spread: scores.length ? Math.max(...scores) - Math.min(...scores) : null,
    stdDev,
    consistency: consistencyOf(stdDev),
  };
}

/**
 * What a player's handicap would be next season if the season ended today.
 *
 * Exactly the ordinary calculation, pointed at the season in progress instead
 * of the finished one. It moves with every round posted, which is the point:
 * it is the only figure on the screen that tells a player what this afternoon
 * costs them next year.
 */
export function projectHandicap(
  currentSeasonRounds: HistoricalRound[],
  bestOf: number,
  windowEvents: number,
  seasonLabel: string | number,
): HandicapResult {
  return computeHandicap(currentSeasonRounds, bestOf, windowEvents, seasonLabel);
}

/** Event name where there is one, otherwise its number within the season. */
export function eventLabelOf(round: {
  eventName: string | null;
  sequence: number;
}): string {
  const name = round.eventName?.trim();
  return name ? name : `#${round.sequence}`;
}
