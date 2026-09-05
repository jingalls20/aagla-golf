import { describe, expect, it } from 'vitest';
import {
  championshipHandicap,
  computeHandicap,
  consistencyOf,
  describeHandicap,
  eventLabelOf,
  handicapBreakdown,
  projectHandicap,
  stdDevOf,
} from './handicap';
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
    expect(result.roundsUsed.map((r) => r.trueScore).sort((a, b) => a - b)).toEqual([
      20, 30,
    ]);
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
    expect(result.note).toContain('Only three rounds from 2025 to draw on');
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

  it('allows the reduction to push a handicap negative', () => {
    // A starting handicap of 2, reduced by 9 strokes (rank 10), ends up
    // owing 7 -- that's the point of the stagger, not a bug.
    expect(championshipHandicap(2, 10)).toBe(-7);
  });

  it('applies no reduction to a player with no season standing', () => {
    expect(championshipHandicap(7.5, null)).toBe(8);
  });

  it('rounds to the nearest whole stroke', () => {
    expect(championshipHandicap(10.333, 2)).toBe(9);
  });
});

describe('describeHandicap', () => {
  it('shows the working: which rounds, and what they averaged to', () => {
    const result = computeHandicap(rounds(12, 14, 16, 18), 3, 7, 2025);
    const text = describeHandicap(result, 2025);
    expect(text).toContain('The best three of the last four rounds played in 2025');
    expect(text).toContain('12, 14, 16');
    expect(text).toContain('14');
  });

  it('explains a zero default in plain language', () => {
    const result = computeHandicap([], 3, 7, 2025);
    expect(describeHandicap(result, 2025)).toContain('defaults to 0');
  });

  it('appends the thin-window caveat when there is one', () => {
    const result = computeHandicap(rounds(10, 12, 14), 3, 7, 2025);
    expect(describeHandicap(result, 2025)).toContain(
      'Only three rounds from 2025 to draw on',
    );
  });
});

describe('stdDevOf', () => {
  it('needs at least two rounds to mean anything', () => {
    expect(stdDevOf([])).toBeNull();
    expect(stdDevOf([5])).toBeNull();
  });

  it('is zero when every round is identical', () => {
    expect(stdDevOf([7, 7, 7, 7])).toBe(0);
  });

  it('uses the population formula, not the sample one', () => {
    // Sample sd here would be 2.16; population is 1.87.
    expect(stdDevOf([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
    expect(stdDevOf([4, 8])).toBe(2);
  });
});

describe('consistencyOf', () => {
  it('sorts players into three coarse buckets', () => {
    expect(consistencyOf(0)).toBe('steady');
    expect(consistencyOf(2.9)).toBe('steady');
    expect(consistencyOf(3)).toBe('variable');
    expect(consistencyOf(5.9)).toBe('variable');
    expect(consistencyOf(6)).toBe('streaky');
    expect(consistencyOf(null)).toBeNull();
  });
});

describe('eventLabelOf', () => {
  it('prefers a real name', () => {
    expect(eventLabelOf({ eventName: 'Spring Open', sequence: 3 })).toBe('Spring Open');
  });

  it('falls back to the event number when unnamed', () => {
    expect(eventLabelOf({ eventName: null, sequence: 3 })).toBe('#3');
    expect(eventLabelOf({ eventName: '', sequence: 7 })).toBe('#7');
    // Whitespace is not a name.
    expect(eventLabelOf({ eventName: '   ', sequence: 2 })).toBe('#2');
  });
});

describe('handicapBreakdown', () => {
  /** Rounds in sequence order with the given scores. */
  const rs = (...scores: number[]): HistoricalRound[] =>
    scores.map((trueScore, i) => ({
      eventId: `e${i}`,
      eventName: null,
      eventType: 'event' as const,
      sequence: i + 1,
      trueScore,
    }));

  it('agrees with computeHandicap on the figure itself', () => {
    const rounds = rs(10, 4, 8, 6, 12, 5, 9);
    expect(handicapBreakdown(rounds, 3, 7, 2025).fs).toBe(
      computeHandicap(rounds, 3, 7, 2025).fs,
    );
  });

  it('marks exactly the rounds that counted', () => {
    // Window is all 5; best 3 are 4, 5, 6.
    const b = handicapBreakdown(rs(10, 4, 6, 12, 5), 3, 7, 2025);
    expect(
      b.considered
        .filter((r) => r.used)
        .map((r) => r.trueScore)
        .sort(),
    ).toEqual([4, 5, 6]);
    expect(
      b.considered
        .filter((r) => !r.used)
        .map((r) => r.trueScore)
        .sort(),
    ).toEqual([10, 12]);
  });

  it('marks only one of two rounds tied on the same score', () => {
    // Best 2 of 6, 6, 9 -- both sixes tie, but only two rounds may count.
    const b = handicapBreakdown(rs(6, 6, 9), 2, 7, 2025);
    expect(b.considered.filter((r) => r.used)).toHaveLength(2);
    expect(b.considered.filter((r) => r.used).map((r) => r.trueScore)).toEqual([6, 6]);
  });

  it('separates rounds that fell outside the window', () => {
    const b = handicapBreakdown(rs(1, 2, 3, 4, 5, 6, 7, 8, 9), 3, 4, 2025);
    expect(b.considered.map((r) => r.trueScore)).toEqual([6, 7, 8, 9]);
    expect(b.outsideWindow.map((r) => r.trueScore)).toEqual([1, 2, 3, 4, 5]);
  });

  it('averages the whole window for the all-scores figure', () => {
    // Best 3 of (4, 6, 8, 10, 12) = 6; all five average 8.
    const b = handicapBreakdown(rs(4, 6, 8, 10, 12), 3, 7, 2025);
    expect(b.fs).toBe(6);
    expect(b.allConsideredFs).toBe(8);
  });

  it('shows how far the figure leans on the single best round', () => {
    // Best 3 of (2, 9, 10, 11) = 7. Drop the 2 and it becomes 10.
    const b = handicapBreakdown(rs(2, 9, 10, 11), 3, 7, 2025);
    expect(b.fs).toBe(7);
    expect(b.withoutBestFs).toBe(10);
  });

  it('reports spread and consistency across the window', () => {
    const steady = handicapBreakdown(rs(6, 7, 6, 7), 3, 7, 2025);
    expect(steady.spread).toBe(1);
    expect(steady.consistency).toBe('steady');

    const wild = handicapBreakdown(rs(0, 20, 2, 18), 3, 7, 2025);
    expect(wild.spread).toBe(20);
    expect(wild.consistency).toBe('streaky');
  });

  it('is safe for a player with no history at all', () => {
    const b = handicapBreakdown([], 3, 7, 2025);
    expect(b.fs).toBe(0);
    expect(b.considered).toEqual([]);
    expect(b.outsideWindow).toEqual([]);
    expect(b.allConsideredFs).toBeNull();
    expect(b.withoutBestFs).toBeNull();
    expect(b.consistency).toBeNull();
  });

  it('leaves the alternatives undefined for a single round', () => {
    const b = handicapBreakdown(rs(5), 3, 7, 2025);
    expect(b.fs).toBe(5);
    expect(b.allConsideredFs).toBe(5);
    expect(b.withoutBestFs).toBeNull();
    expect(b.stdDev).toBeNull();
  });
});

describe('projectHandicap', () => {
  it('applies the ordinary rule to the season in progress', () => {
    const partial: HistoricalRound[] = [4, 8, 6].map((trueScore, i) => ({
      eventId: `e${i}`,
      eventName: null,
      eventType: 'event' as const,
      sequence: i + 1,
      trueScore,
    }));
    expect(projectHandicap(partial, 3, 7, 2026).fs).toBe(6);
  });

  it('returns the zero default before anyone has played', () => {
    const p = projectHandicap([], 3, 7, 2026);
    expect(p.fs).toBe(0);
    expect(p.note).toContain('No 2026 rounds found');
  });
});
