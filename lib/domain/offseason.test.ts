import { describe, expect, it } from 'vitest';
import {
  seasonRecapView,
  toParWords,
  type RecapRound,
  type RecapStanding,
  type SeasonRecapInput,
} from './offseason';

function standing(
  name: string,
  totalPoints: number,
  over: Partial<RecapStanding> = {},
): RecapStanding {
  return {
    playerId: name.toLowerCase(),
    playerName: name,
    totalPoints,
    eventsPlayed: 7,
    seasonRank: 1,
    ...over,
  };
}

function round(name: string, over: Partial<RecapRound> = {}): RecapRound {
  return {
    playerId: name.toLowerCase(),
    playerName: name,
    eventId: 'e1',
    eventLabel: 'Willows Run',
    eventType: 'event',
    trueScore: 12,
    netScore: 2,
    place: 3,
    ...over,
  };
}

function input(over: Partial<SeasonRecapInput> = {}): SeasonRecapInput {
  return {
    year: 2026,
    standings: [
      standing('Ann Green', 4, { seasonRank: 1 }),
      standing('Bob Blue', 9, { seasonRank: 2 }),
    ],
    rounds: [round('Ann Green', { place: 1 }), round('Bob Blue', { place: 2 })],
    championIds: [],
    eventsPlayed: 7,
    eventsScheduled: 7,
    ...over,
  };
}

describe('seasonRecapView', () => {
  it('says nothing happened when nothing was played', () => {
    const view = seasonRecapView(input({ rounds: [], standings: [] }));
    expect(view.summary).toBe('No rounds were recorded in 2026.');
    expect(view.highlights).toEqual([]);
    expect(view.pointsWinners).toEqual([]);
  });

  it('names the points winner and the margin', () => {
    const view = seasonRecapView(input());
    expect(view.pointsWinners.map((w) => w.playerName)).toEqual(['Ann Green']);
    expect(view.summary).toContain('Ann Green took the season on 4 points');
    expect(view.summary).toContain('5 points clear of Bob Blue');
  });

  it('treats a tie at the top as shared, with no margin', () => {
    const view = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 4, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 1 }),
        ],
      }),
    );
    expect(view.pointsWinners).toHaveLength(2);
    expect(view.summary).toContain('Ann Green and Bob Blue finished level on 4 points');
    expect(view.summary).not.toContain('clear of');
  });

  it('never claims a margin when the winner is alone in the table', () => {
    const view = seasonRecapView(
      input({ standings: [standing('Ann Green', 4)], rounds: [round('Ann Green')] }),
    );
    expect(view.summary).not.toContain('clear of');
  });

  it('calls it the double when the champion also took the points', () => {
    const view = seasonRecapView(input({ championIds: ['ann green'] }));
    expect(view.summary).toContain('the double');
  });

  it('names the champion when somebody else took the points', () => {
    const view = seasonRecapView(input({ championIds: ['bob blue'] }));
    expect(view.summary).toContain('Bob Blue took the Championship');
    expect(view.summary).not.toContain('the double');
  });

  it('counts a season that fell short of its schedule', () => {
    const view = seasonRecapView(input({ eventsPlayed: 5, eventsScheduled: 7 }));
    expect(view.summary).toContain('5 events played of 7 scheduled');
  });

  it('ignores rounds nobody played', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { place: 1, trueScore: 4, netScore: -4 }),
          // A DNP carries a place and points but no score. Counting it would
          // hand somebody a "round of the year" they never played.
          round('Bob Blue', { trueScore: null, netScore: null, place: 5 }),
        ],
      }),
    );
    const best = view.highlights.find((h) => h.label === 'Round of the year');
    expect(best?.who).toBe('Ann Green');
    expect(view.highlights.every((h) => h.who !== 'Bob Blue')).toBe(true);
  });

  it('picks the lowest net and lowest gross rounds', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { trueScore: 2, netScore: 5 }),
          round('Bob Blue', { trueScore: 20, netScore: -6, eventLabel: 'Jefferson' }),
        ],
      }),
    );
    expect(view.highlights.find((h) => h.label === 'Round of the year')).toMatchObject({
      who: 'Bob Blue',
      detail: '6 under par net · Jefferson',
    });
    expect(view.highlights.find((h) => h.label === 'Low gross')).toMatchObject({
      who: 'Ann Green',
    });
  });

  it('keeps everyone who tied for a highlight', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { netScore: -3 }),
          round('Bob Blue', { netScore: -3 }),
        ],
      }),
    );
    expect(view.highlights.find((h) => h.label === 'Round of the year')?.who).toBe(
      'Ann Green and Bob Blue',
    );
  });

  it('leaves out most rounds when everybody played the same number', () => {
    // Nobody "led" attendance in a season everyone played in full, so the
    // card would be noise rather than a superlative.
    const view = seasonRecapView(input());
    expect(view.highlights.some((h) => h.label === 'Most rounds')).toBe(false);
  });

  it('shows most rounds when somebody genuinely turned up more', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { eventId: 'e1' }),
          round('Ann Green', { eventId: 'e2' }),
          round('Bob Blue', { eventId: 'e1' }),
        ],
      }),
    );
    expect(view.highlights.find((h) => h.label === 'Most rounds')).toMatchObject({
      who: 'Ann Green',
      detail: '2 rounds',
    });
  });

  it('counts wins across the year', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { eventId: 'e1', place: 1 }),
          round('Ann Green', { eventId: 'e2', place: 1 }),
          round('Bob Blue', { eventId: 'e3', place: 1 }),
        ],
      }),
    );
    expect(view.summary).toContain('2 different winners');
    expect(view.summary).toContain('Ann Green taking 2 of them');
    expect(view.highlights.find((h) => h.label === 'Most wins')).toMatchObject({
      who: 'Ann Green',
      detail: '2 wins',
    });
  });

  it('names nobody as top winner when two players tie on wins', () => {
    const view = seasonRecapView(
      input({
        rounds: [
          round('Ann Green', { eventId: 'e1', place: 1 }),
          round('Ann Green', { eventId: 'e2', place: 1 }),
          round('Bob Blue', { eventId: 'e3', place: 1 }),
          round('Bob Blue', { eventId: 'e4', place: 1 }),
        ],
      }),
    );
    expect(view.summary).toContain('2 different winners across the year.');
    expect(view.summary).not.toContain('taking');
    // The card still names both, because there the tie is the point.
    expect(view.highlights.find((h) => h.label === 'Most wins')?.who).toBe(
      'Ann Green and Bob Blue',
    );
  });

  it('drops the most-wins card when nobody won anything', () => {
    const view = seasonRecapView(input({ rounds: [round('Ann Green', { place: 4 })] }));
    expect(view.highlights.some((h) => h.label === 'Most wins')).toBe(false);
  });
});

describe('toParWords', () => {
  it('reads scores the golfer way', () => {
    expect(toParWords(0)).toBe('level par');
    expect(toParWords(-4)).toBe('4 under par');
    expect(toParWords(3)).toBe('3 over par');
  });
});
