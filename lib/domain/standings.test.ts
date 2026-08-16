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

describe('the drop-worst rule', () => {
  const SEATTLE = { dropWorst: 1, minResults: 2 };
  const r = (
    playerId: string,
    eventPoints: number,
    over: Partial<Parameters<typeof computeStandings>[0][number]> = {},
  ) => ({ playerId, eventPoints, eventId: `e${eventPoints}`, ...over });

  it('changes nothing when no rule is given', () => {
    const rows = [r('a', 1), r('a', 3), r('a', 2)];
    expect(computeStandings(rows)[0].totalPoints).toBe(6);
    expect(computeStandings(rows)[0].droppedEventIds).toEqual([]);
  });

  it('sets aside the worst result and names it', () => {
    const rows = [
      r('a', 1, { eventId: 'good', sequence: 1 }),
      r('a', 3, { eventId: 'worst', sequence: 2 }),
      r('a', 2, { eventId: 'mid', sequence: 3 }),
    ];
    const [row] = computeStandings(rows, SEATTLE);
    expect(row.totalPoints).toBe(3);
    expect(row.droppedEventIds).toEqual(['worst']);
  });

  it('still counts a dropped event as one the player turned out for', () => {
    const rows = [r('a', 1, { sequence: 1 }), r('a', 3, { sequence: 2 })];
    expect(computeStandings(rows, SEATTLE)[0].eventsPlayed).toBe(2);
  });

  it('never drops a major, however bad it was', () => {
    const rows = [
      r('a', 1, { eventId: 'event', sequence: 1 }),
      r('a', 9, { eventId: 'major', sequence: 2, droppable: false }),
      r('a', 2, { eventId: 'other', sequence: 3 }),
    ];
    const [row] = computeStandings(rows, SEATTLE);
    expect(row.droppedEventIds).toEqual(['other']);
    expect(row.totalPoints).toBe(10);
  });

  it('does nothing for a player with a single result', () => {
    const [row] = computeStandings([r('a', 4, { eventId: 'only' })], SEATTLE);
    expect(row.totalPoints).toBe(4);
    expect(row.droppedEventIds).toEqual([]);
  });

  it('never leaves a card with nothing on it', () => {
    const rows = [
      r('a', 2, { eventId: 'x', sequence: 1 }),
      r('a', 3, { eventId: 'y', sequence: 2 }),
    ];
    const [row] = computeStandings(rows, { dropWorst: 5, minResults: 2 });
    expect(row.droppedEventIds).toEqual(['y']);
    expect(row.totalPoints).toBe(2);
  });

  it('drops nothing for a player who has only played majors', () => {
    const rows = [
      r('a', 4, { eventId: 'm1', droppable: false }),
      r('a', 5, { eventId: 'm2', droppable: false }),
    ];
    const [row] = computeStandings(rows, SEATTLE);
    expect(row.droppedEventIds).toEqual([]);
    expect(row.totalPoints).toBe(9);
  });

  it('breaks a tie between two equally bad results the same way every time', () => {
    const rows = [
      r('a', 3, { eventId: 'later', sequence: 5 }),
      r('a', 3, { eventId: 'earlier', sequence: 2 }),
      r('a', 1, { eventId: 'good', sequence: 1 }),
    ];
    expect(computeStandings(rows, SEATTLE)[0].droppedEventIds).toEqual(['earlier']);
    expect(computeStandings([...rows].reverse(), SEATTLE)[0].droppedEventIds).toEqual([
      'earlier',
    ]);
  });

  it('re-ranks the field on dropped totals rather than raw ones', () => {
    const rows = [
      r('a', 0, { eventId: 'a1', sequence: 1 }),
      r('a', 6, { eventId: 'a2', sequence: 2 }),
      r('b', 2, { eventId: 'b1', sequence: 1 }),
      r('b', 2, { eventId: 'b2', sequence: 2 }),
    ];
    expect(computeStandings(rows).map((x) => x.playerId)).toEqual(['b', 'a']);

    const dropped = computeStandings(rows, SEATTLE);
    expect(dropped.map((x) => x.playerId)).toEqual(['a', 'b']);
    expect(dropped[0].totalPoints).toBe(0);
    expect(dropped[1].totalPoints).toBe(2);
  });
});
