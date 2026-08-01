import { describe, expect, it } from 'vitest';
import { championshipHandicap, computeHandicap, describeHandicap } from './handicap';
import type { HistoricalRound } from './types';

/** Builds a run of rounds with ascending sequence and the given true scores. */
function rounds(...trueScores: number[]): HistoricalRound[] {
  return trueScores.map((trueScore, i) => ({
    eventId: `e${i + 1}`,
    eventName: `Event ${i + 1}`,
    eventType: 'event' as const,
    sequence: i + 1,
    trueScore,
  }));
}

describe('computeHandicap', () => {
  it('averages the best N rounds in the window', () => {
    // Best 3 of 12, 14, 16, 18 -> (12 + 14 + 16) / 3 = 14.
    const result = computeHandicap(rounds(12, 14, 16, 18), 3, 7, 2025);
    expect(result.fs).toBe(14);
    expect(result.roundsUsed.map((r) => r.trueScore)).toEqual([12, 14, 16]);
  });

  it('looks only at the most recent M rounds, discarding older ones', () => {
    // Window of 3 keeps the last three rounds (20, 22, 24), so the early 5 --
    // which would otherwise dominate a best-of -- is out of scope entirely.
    const result = computeHandicap(rounds(5, 6, 20, 22, 24), 3, 3, 2025);
    expect(result.roundsUsed.map((r) => r.trueScore)).toEqual([20, 22, 24]);
    expect(result.fs).toBe(22);
  });

  it('discards blow-up rounds so one bad day does not inflate the handicap', () => {
    // The 40 is in the window but is not among the best 3.
    const result = computeHandicap(rounds(10, 12, 14, 40), 3, 7, 2025);
    expect(result.fs).toBe(12);
    expect(result.roundsUsed.some((r) => r.trueScore === 40)).toBe(false);
  });

  it('orders by sequence, not by the order rounds happen to arrive', () => {
    const shuffled: HistoricalRound[] = [
      { eventId: 'c', eventName: 'C', eventType: 'event', sequence: 3, trueScore: 30 },
      { eventId: 'a', eventName: 'A', eventType: 'event', sequence: 1, trueScore: 10 },
      { eventId: 'b', eventName: 'B', eventType: 'event', sequence: 2, trueScore: 20 },
    ];
    // Window of 2 must keep sequences 2 and 3, whatever order they came in.
    const result = computeHandicap(shuffled, 2, 2, 2025);
    expect(result.roundsUsed.map((r) => r.trueScore).sort((a, b) => a - b)).toEqual([20, 30]);
  });

  it('defaults a player with no history to zero, and says so', () => {
    const result = computeHandicap([], 3, 7, 2025);
    expect(result.fs).toBe(0);
    expect(result.roundsUsed).toEqual([]);
    expect(result.consideredCount).toBe(0);
    expect(result.note).toContain('No 2025 rounds found');
  });

  it('uses what it has when a player has fewer rounds than best-of', () => {
    const result = computeHandicap(rounds(10, 20), 3, 7, 2025);
    expect(result.fs).toBe(15);
    expect(result.roundsUsed).toHaveLength(2);
  });

  it('flags a thin window so the number can be shown with a caveat', () => {
    const result = computeHandicap(rounds(10, 12, 14), 3, 7, 2025);
    expect(result.consideredCount).toBe(3);
    expect(result.note).toContain('Only 3 of 2025');
  });

  it('reports no caveat when the window was full', () => {
    const result = computeHandicap(rounds(1, 2, 3, 4, 5, 6, 7), 3, 7, 2025);
    expect(result.note).toBe('');
  });

  it('rejects nonsensical rules rather than producing a number from them', () => {
    expect(() => computeHandicap(rounds(10), 0, 7, 2025)).toThrow(/at least 1/);
    expect(() => computeHandicap(rounds(10), 3, 0, 2025)).toThrow(/at least 1/);
  });
});

describe('championshipHandicap', () => {
  it('lets the season leader play their full handicap', () => {
    expect(championshipHandicap(10, 1)).toBe(10);
  });

  it('takes one stroke per place back through the field', () => {
    expect(championshipHandicap(10, 2)).toBe(9);
    expect(championshipHandicap(10, 3)).toBe(8);
    expect(championshipHandicap(10, 5)).toBe(6);
  });

  it('never reduces a handicap below zero', () => {
    expect(championshipHandicap(2, 10)).toBe(0);
  });

  it('applies no reduction to a player with no season standing', () => {
    expect(championshipHandicap(7.5, null)).toBe(7.5);
  });

  it('rounds to two decimals for display', () => {
    expect(championshipHandicap(10.333, 2)).toBe(9.33);
  });
});

describe('describeHandicap', () => {
  it('shows the working: which rounds, and what they averaged to', () => {
    const result = computeHandicap(rounds(12, 14, 16, 18), 3, 7, 2025);
    const text = describeHandicap(result, 2025);
    expect(text).toContain('Best 3 of last 4');
    expect(text).toContain('12, 14, 16');
    expect(text).toContain('14');
  });

  it('explains a zero default in plain language', () => {
    const result = computeHandicap([], 3, 7, 2025);
    expect(describeHandicap(result, 2025)).toContain('defaults to 0');
  });

  it('appends the thin-window caveat when there is one', () => {
    const result = computeHandicap(rounds(10, 12, 14), 3, 7, 2025);
    expect(describeHandicap(result, 2025)).toContain('Only 3 of 2025');
  });
});
