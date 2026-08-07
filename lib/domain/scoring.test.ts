import { describe, expect, it } from 'vitest';
import { DEFAULT_POINTS_TABLE, pointsForPlace } from './points';
import { denseRank, netScoreFor, recomputeEventResults } from './scoring';
import type { DomainScore } from './types';

const pointsTable = DEFAULT_POINTS_TABLE;

/** Convenience builder so tests read as rules, not as object literals. */
function score(
  playerId: string,
  trueScore: number | null,
  fsApplied = 0,
  courseDifferential = 0,
  source: DomainScore['source'] = 'new',
): DomainScore {
  return { playerId, trueScore, fsApplied, courseDifferential, source };
}

describe('netScoreFor', () => {
  it('subtracts the handicap from the true score', () => {
    expect(netScoreFor({ trueScore: 90, fsApplied: 10, courseDifferential: 0 })).toBe(
      80,
    );
  });

  it('floors the handicap-adjusted score BEFORE adding the course differential', () => {
    // This case pins the order of operations down, because the two readings
    // disagree:
    //   ours:      floor(90 - 10.5) + (-0.5)  =  79 - 0.5  =  78.5
    //   the other: floor(90 - 10.5  -   0.5)  =  floor(79)  =  79
    // A decade of recorded league history was computed the first way.
    expect(
      netScoreFor({ trueScore: 90, fsApplied: 10.5, courseDifferential: -0.5 }),
    ).toBe(78.5);

    // And the everyday case, where both readings happen to agree.
    expect(netScoreFor({ trueScore: 90, fsApplied: 10.5, courseDifferential: 2 })).toBe(
      81,
    );
  });

  it('treats a missing handicap as zero strokes', () => {
    expect(netScoreFor({ trueScore: 85, fsApplied: null, courseDifferential: 0 })).toBe(
      85,
    );
  });

  it('handles scores expressed relative to par, including negatives', () => {
    expect(netScoreFor({ trueScore: -2, fsApplied: 3, courseDifferential: 0 })).toBe(
      -5,
    );
  });
});

describe('denseRank', () => {
  it('ranks ascending with 1 as best', () => {
    const ranks = denseRank([74, 70, 72]);
    expect(ranks.get(70)).toBe(1);
    expect(ranks.get(72)).toBe(2);
    expect(ranks.get(74)).toBe(3);
  });

  it('shares a place on ties and does NOT skip the next place', () => {
    // The defining property of dense ranking: 70, 72, 72, 74 -> 1, 2, 2, 3.
    const ranks = denseRank([70, 72, 72, 74]);
    expect(ranks.get(70)).toBe(1);
    expect(ranks.get(72)).toBe(2);
    expect(ranks.get(74)).toBe(3);
  });
});

describe('pointsForPlace', () => {
  it('awards zero points for winning, because low total wins the season', () => {
    expect(pointsForPlace(pointsTable, 'event', 1)).toBe(0);
    expect(pointsForPlace(pointsTable, 'major', 1)).toBe(0);
  });

  it('weights majors roughly double an ordinary event', () => {
    expect(pointsForPlace(pointsTable, 'event', 5)).toBe(2.5);
    expect(pointsForPlace(pointsTable, 'major', 5)).toBe(5);
  });

  it('caps places worse than 10th at the 10th-place cost', () => {
    expect(pointsForPlace(pointsTable, 'event', 10)).toBe(5);
    expect(pointsForPlace(pointsTable, 'event', 11)).toBe(5);
    expect(pointsForPlace(pointsTable, 'event', 25)).toBe(5);
    expect(pointsForPlace(pointsTable, 'major', 40)).toBe(10);
  });

  it('always returns zero for a championship, at any place', () => {
    expect(pointsForPlace(pointsTable, 'championship', 1)).toBe(0);
    expect(pointsForPlace(pointsTable, 'championship', 12)).toBe(0);
  });

  it('throws rather than silently awarding a winning zero on a broken table', () => {
    const broken = { ...pointsTable, event: { '1': 0 } };
    expect(() => pointsForPlace(broken, 'event', 4)).toThrow(/no entry for place/);
  });
});

describe('recomputeEventResults', () => {
  it('places players by net score, best first', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 90), score('b', 84), score('c', 88)],
      activePlayerIds: ['a', 'b', 'c'],
    });

    const byPlayer = new Map(result.played.map((r) => [r.playerId, r]));
    expect(byPlayer.get('b')!.place).toBe(1);
    expect(byPlayer.get('c')!.place).toBe(2);
    expect(byPlayer.get('a')!.place).toBe(3);
  });

  it('applies each player’s own handicap before ranking', () => {
    // b shoots worse but plays off more strokes and should win on net.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 84, 0), score('b', 90, 10)],
      activePlayerIds: ['a', 'b'],
    });

    const byPlayer = new Map(result.played.map((r) => [r.playerId, r]));
    expect(byPlayer.get('b')!.netScore).toBe(80);
    expect(byPlayer.get('b')!.place).toBe(1);
    expect(byPlayer.get('a')!.place).toBe(2);
  });

  it('gives tied players the same place and the same points', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 80), score('c', 85)],
      activePlayerIds: ['a', 'b', 'c'],
    });

    const byPlayer = new Map(result.played.map((r) => [r.playerId, r]));
    expect(byPlayer.get('a')!.place).toBe(1);
    expect(byPlayer.get('b')!.place).toBe(1);
    expect(byPlayer.get('a')!.eventPoints).toBe(byPlayer.get('b')!.eventPoints);
    // Dense ranking: c is 2nd, not 3rd.
    expect(byPlayer.get('c')!.place).toBe(2);
  });

  it('does not penalize no-shows before half the roster has played', () => {
    // 2 of 6 played: below the threshold, so the event is still in progress.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 85)],
      activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    });

    expect(result.thresholdMet).toBe(false);
    expect(result.missed).toEqual([]);
  });

  it('penalizes no-shows once half the roster has played', () => {
    // 3 of 6 played: exactly half meets the threshold.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 85), score('c', 90)],
      activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    });

    expect(result.thresholdMet).toBe(true);
    expect(result.missed.map((m) => m.playerId).sort()).toEqual(['d', 'e', 'f']);
  });

  it('treats an odd roster as needing a true majority-ish share', () => {
    // 4 of 9 is below 4.5 and does not meet the threshold.
    const below = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: ['a', 'b', 'c', 'd'].map((id) => score(id, 80)),
      activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    expect(below.thresholdMet).toBe(false);

    // 5 of 9 clears it.
    const above = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: ['a', 'b', 'c', 'd', 'e'].map((id) => score(id, 80)),
      activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    expect(above.thresholdMet).toBe(true);
  });

  it('puts every no-show in ONE shared place, just worse than the worst score', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 85), score('c', 90)],
      activePlayerIds: ['a', 'b', 'c', 'd', 'e'],
    });

    // Worst actual place is 3rd, so no-shows share 4th -- they are not ranked
    // against each other.
    expect(result.missed.every((m) => m.place === 4)).toBe(true);
    expect(new Set(result.missed.map((m) => m.eventPoints)).size).toBe(1);
    expect(result.missed[0].eventPoints).toBe(2);
  });

  it('shares one place among no-shows even when the leaders tied', () => {
    // Two players tie for 1st, one is 2nd -> worst place is 2, no-shows get 3.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 80), score('c', 90)],
      activePlayerIds: ['a', 'b', 'c', 'd'],
    });

    expect(result.missed[0].place).toBe(3);
  });

  it('clears stale missed rows when the event drops back below the threshold', () => {
    // Only one real score remains, but a placeholder from an earlier state is
    // still on file. It is no longer earned and must be removed.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('d', null, 0, 0, 'missed')],
      activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
    });

    expect(result.thresholdMet).toBe(false);
    expect(result.missed).toEqual([]);
    expect(result.clearMissedFor).toEqual(['d']);
  });

  it('clears missed rows when everyone has since posted a score', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 85)],
      activePlayerIds: ['a', 'b'],
    });

    expect(result.missed).toEqual([]);
    expect(result.clearMissedFor).toEqual([]);
  });

  it('leaves an event with no scores completely alone', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [],
      activePlayerIds: ['a', 'b', 'c'],
    });

    expect(result).toEqual({
      played: [],
      missed: [],
      clearMissedFor: [],
      thresholdMet: false,
    });
  });

  it('still ranks a championship, but awards nobody any season points', () => {
    const result = recomputeEventResults({
      eventType: 'championship',
      pointsTable,
      scores: [score('a', 80), score('b', 85), score('c', 90)],
      activePlayerIds: ['a', 'b', 'c'],
    });

    expect(result.played.map((r) => r.place).sort()).toEqual([1, 2, 3]);
    expect(result.played.every((r) => r.eventPoints === 0)).toBe(true);
  });

  it('preserves the historical source tag so imported rows stay identifiable', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80, 0, 0, 'historical')],
      activePlayerIds: ['a'],
    });

    expect(result.played[0].source).toBe('historical');
  });

  it('ignores inactive players when deciding who missed the event', () => {
    // 'z' is not on the active roster, so their absence is not a no-show.
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('b', 85)],
      activePlayerIds: ['a', 'b'],
    });

    expect(result.missed).toEqual([]);
  });

  it('scores a guest who played but is no longer on the active roster', () => {
    const result = recomputeEventResults({
      eventType: 'event',
      pointsTable,
      scores: [score('a', 80), score('retired', 75)],
      activePlayerIds: ['a'],
    });

    const byPlayer = new Map(result.played.map((r) => [r.playerId, r]));
    expect(byPlayer.get('retired')!.place).toBe(1);
    expect(byPlayer.get('a')!.place).toBe(2);
  });

  describe('DNP', () => {
    it('places an explicit DNP last and awards last-place points, even below the no-show threshold', () => {
      // Only 1 of 6 accounted for -- nowhere near the automatic threshold --
      // but a DNP applies immediately regardless.
      const result = recomputeEventResults({
        eventType: 'event',
        pointsTable,
        scores: [score('a', 80), score('d', null, 0, 0, 'dnp')],
        activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      const dnpResult = result.missed.find((m) => m.playerId === 'd');
      expect(dnpResult).toBeDefined();
      expect(dnpResult!.source).toBe('dnp');
      expect(dnpResult!.place).toBe(2); // worse than a's 1st
      expect(dnpResult!.eventPoints).toBe(pointsForPlace(pointsTable, 'event', 2));
      // b, c, e, f are still just silent -- below threshold, not penalized yet.
      expect(result.missed.map((m) => m.playerId)).toEqual(['d']);
      expect(result.thresholdMet).toBe(false);
    });

    it('counts a DNP toward the threshold, so it can tip the rest of a silent roster into automatic no-shows', () => {
      // 2 played + 1 DNP = 3 of 6 accounted for -- exactly meets the threshold,
      // even though only 2 people actually posted a score.
      const result = recomputeEventResults({
        eventType: 'event',
        pointsTable,
        scores: [score('a', 80), score('b', 85), score('c', null, 0, 0, 'dnp')],
        activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(result.thresholdMet).toBe(true);
      const byPlayer = new Map(result.missed.map((m) => [m.playerId, m]));
      expect(byPlayer.get('c')!.source).toBe('dnp');
      expect(byPlayer.get('d')!.source).toBe('missed');
      expect(byPlayer.get('e')!.source).toBe('missed');
      expect(byPlayer.get('f')!.source).toBe('missed');
      // Everyone who didn't play -- DNP or automatic no-show -- shares 3rd.
      expect(result.missed.every((m) => m.place === 3)).toBe(true);
    });

    it('never clears a DNP row, unlike an unearned automatic missed placeholder', () => {
      // The roster shrank back below threshold, so the automatic 'missed' row
      // for 'e' is no longer earned -- but 'd's explicit DNP stands regardless.
      const result = recomputeEventResults({
        eventType: 'event',
        pointsTable,
        scores: [
          score('a', 80),
          score('d', null, 0, 0, 'dnp'),
          score('e', null, 0, 0, 'missed'),
        ],
        activePlayerIds: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      expect(result.clearMissedFor).toEqual(['e']);
      expect(result.missed.map((m) => m.playerId)).toEqual(['d']);
    });

    it('handles an event that is DNP-only, with nobody having played at all', () => {
      const result = recomputeEventResults({
        eventType: 'event',
        pointsTable,
        scores: [score('a', null, 0, 0, 'dnp')],
        activePlayerIds: ['a'],
      });

      expect(result.played).toEqual([]);
      expect(result.missed[0].place).toBe(1);
      expect(result.missed[0].eventPoints).toBe(
        pointsForPlace(pointsTable, 'event', 1),
      );
    });
  });
});
