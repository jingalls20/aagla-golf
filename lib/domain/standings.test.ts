import { describe, expect, it } from 'vitest';
import { computeStandings, round2 } from './standings';

describe('computeStandings', () => {
  it('totals each player’s points across the season', () => {
    const standings = computeStandings([
      { playerId: 'a', eventPoints: 1 },
      { playerId: 'a', eventPoints: 2.5 },
      { playerId: 'b', eventPoints: 4 },
    ]);

    const byPlayer = new Map(standings.map((s) => [s.playerId, s]));
    expect(byPlayer.get('a')!.totalPoints).toBe(3.5);
    expect(byPlayer.get('a')!.eventsPlayed).toBe(2);
    expect(byPlayer.get('b')!.totalPoints).toBe(4);
  });

  it('ranks the LOWEST total first, because winning an event scores zero', () => {
    const standings = computeStandings([
      { playerId: 'high', eventPoints: 20 },
      { playerId: 'low', eventPoints: 3 },
      { playerId: 'mid', eventPoints: 10 },
    ]);

    expect(standings[0].playerId).toBe('low');
    expect(standings[0].seasonRank).toBe(1);
    expect(standings[2].playerId).toBe('high');
  });

  it('returns rows already sorted best-first', () => {
    const standings = computeStandings([
      { playerId: 'c', eventPoints: 9 },
      { playerId: 'a', eventPoints: 1 },
      { playerId: 'b', eventPoints: 5 },
    ]);

    expect(standings.map((s) => s.playerId)).toEqual(['a', 'b', 'c']);
  });

  it('shares a rank on ties without skipping the next rank', () => {
    const standings = computeStandings([
      { playerId: 'a', eventPoints: 5 },
      { playerId: 'b', eventPoints: 5 },
      { playerId: 'c', eventPoints: 9 },
    ]);

    const byPlayer = new Map(standings.map((s) => [s.playerId, s]));
    expect(byPlayer.get('a')!.seasonRank).toBe(1);
    expect(byPlayer.get('b')!.seasonRank).toBe(1);
    // Dense ranking: c is 2nd, not 3rd.
    expect(byPlayer.get('c')!.seasonRank).toBe(2);
  });

  it('keeps floating-point ties genuinely tied', () => {
    // The league's own points table deals only in halves, which binary
    // floating point represents exactly. But points_table is per-season
    // configuration, so a league is free to use tenths -- and 1.1 + 2.2 is
    // 3.3000000000000003, not 3.3. Without rounding before ranking, these two
    // players would come out 1st and 2nd despite having scored identically.
    const standings = computeStandings([
      { playerId: 'a', eventPoints: 1.1 },
      { playerId: 'a', eventPoints: 2.2 },
      { playerId: 'b', eventPoints: 3.3 },
    ]);

    const byPlayer = new Map(standings.map((s) => [s.playerId, s]));
    expect(byPlayer.get('a')!.totalPoints).toBe(3.3);
    expect(byPlayer.get('a')!.seasonRank).toBe(1);
    expect(byPlayer.get('b')!.seasonRank).toBe(1);
  });

  it('counts events played, including zero-point wins', () => {
    const standings = computeStandings([
      { playerId: 'a', eventPoints: 0 },
      { playerId: 'a', eventPoints: 0 },
      { playerId: 'a', eventPoints: 1 },
    ]);

    expect(standings[0].eventsPlayed).toBe(3);
    expect(standings[0].totalPoints).toBe(1);
  });

  it('returns nothing for a season with no results yet', () => {
    expect(computeStandings([])).toEqual([]);
  });
});

describe('round2', () => {
  it('rounds to two decimal places', () => {
    expect(round2(1.005)).toBe(1);
    expect(round2(12.345)).toBe(12.35);
    expect(round2(12.0000000001)).toBe(12);
  });
});
