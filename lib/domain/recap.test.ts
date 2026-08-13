import { describe, expect, it } from 'vitest';
import {
  DISCORD_LIMIT,
  eventLabel,
  eventRecap,
  fitToDiscord,
  seasonRecap,
  toPar,
  type RecapRound,
} from './recap';

function r(over: Partial<RecapRound> = {}): RecapRound {
  return {
    playerName: 'Player',
    trueScore: 10,
    netScore: 4,
    place: 3,
    eventPoints: 3,
    fsApplied: 6,
    ...over,
  };
}

function event(over: Partial<Parameters<typeof eventRecap>[0]> = {}) {
  return eventRecap({
    leagueName: 'AAGLA Iowa',
    year: 2026,
    eventType: 'event' as const,
    eventName: 'Toad Valley',
    course: 'Toad Valley',
    sequence: 4,
    rounds: [r({ playerName: 'Winner', place: 1, netScore: -3, trueScore: 6 })],
    ...over,
  });
}

describe('toPar', () => {
  it('reads scores the golfer’s way', () => {
    expect(toPar(0)).toBe('even');
    expect(toPar(-4)).toBe('-4');
    expect(toPar(5)).toBe('+5');
  });
});

describe('eventLabel', () => {
  const base = {
    eventName: null,
    course: null,
    sequence: 4,
    eventType: 'event' as const,
  };

  it('uses both when the name and the course are different things', () => {
    expect(eventLabel({ ...base, eventName: 'Ryder Cup', course: 'Toad Valley' })).toBe(
      'Ryder Cup at Toad Valley',
    );
  });

  it('does not repeat itself when they are the same', () => {
    expect(
      eventLabel({ ...base, eventName: 'Toad Valley', course: 'Toad Valley' }),
    ).toBe('Toad Valley');
  });

  it('falls back to whichever one exists', () => {
    expect(eventLabel({ ...base, eventName: 'Wildcard' })).toBe('Wildcard');
    expect(eventLabel({ ...base, course: 'Bellevue' })).toBe('Bellevue');
  });

  it('falls back to the number, naming the kind of event', () => {
    expect(eventLabel(base)).toBe('Event #4');
    expect(eventLabel({ ...base, eventType: 'major' })).toBe('Major #4');
    expect(eventLabel({ ...base, eventType: 'championship' })).toBe('the Championship');
  });
});

describe('eventRecap', () => {
  it('says nothing at all when nobody posted a score', () => {
    expect(event({ rounds: [r({ trueScore: null, netScore: null })] })).toBeNull();
    expect(event({ rounds: [] })).toBeNull();
  });

  it('names the winner and their net score', () => {
    const text = event() as string;
    expect(text).toContain('**Winner** takes it on -3 net');
  });

  it('treats a tie as two winners rather than picking one', () => {
    const text = event({
      rounds: [
        r({ playerName: 'Ann', place: 1, netScore: -2 }),
        r({ playerName: 'Bob', place: 1, netScore: -2 }),
      ],
    }) as string;
    expect(text).toContain('**Ann and Bob** share it');
  });

  it('lists three names in a tie readably', () => {
    const text = event({
      rounds: [
        r({ playerName: 'Ann', place: 1 }),
        r({ playerName: 'Bob', place: 1 }),
        r({ playerName: 'Cal', place: 1 }),
      ],
    }) as string;
    expect(text).toContain('Ann, Bob and Cal');
  });

  it('calls out the best raw round when handicaps hid it', () => {
    const text = event({
      rounds: [
        r({ playerName: 'NetWinner', place: 1, netScore: -4, trueScore: 12 }),
        r({ playerName: 'Striker', place: 4, netScore: 2, trueScore: 1 }),
      ],
    }) as string;
    expect(text).toContain('Low gross: **Striker** at +1');
  });

  it('does not repeat the winner as low gross', () => {
    const text = event({
      rounds: [r({ playerName: 'Both', place: 1, netScore: -4, trueScore: 1 })],
    }) as string;
    expect(text).not.toContain('Low gross');
  });

  it('stops the leaderboard before it becomes a phone book', () => {
    const rounds = Array.from({ length: 12 }, (_, i) =>
      r({ playerName: `P${i + 1}`, place: i + 1 }),
    );
    const text = event({ rounds }) as string;
    expect(text).toContain('P5');
    expect(text).not.toContain('P6');
  });

  it('names the kind of event in the summary line', () => {
    expect(event({ eventType: 'championship' }) as string).toContain(
      '2026 Championship',
    );
    expect(event({ eventType: 'major' }) as string).toContain('2026 Major');
  });

  it('leaves a missing score as a dash rather than a zero', () => {
    const text = event({
      rounds: [r({ playerName: 'Winner', place: 1, netScore: null, trueScore: 8 })],
    }) as string;
    expect(text).toContain('— net');
  });
});

describe('seasonRecap', () => {
  const standings = [
    { playerName: 'Leader', totalPoints: 12, eventsPlayed: 6, seasonRank: 1 },
    { playerName: 'Second', totalPoints: 19, eventsPlayed: 6, seasonRank: 2 },
  ];

  function season(over = {}) {
    return seasonRecap({
      leagueName: 'AAGLA Iowa',
      year: 2026,
      standings,
      eventsPlayed: 3,
      eventsScheduled: 7,
      championName: null,
      rounds: [],
      ...over,
    });
  }

  it('says nothing when there are no standings yet', () => {
    expect(season({ standings: [] })).toBeNull();
  });

  it('says "leads" while the season is still running', () => {
    const text = season() as string;
    expect(text).toContain('**Leader** leads on 12 points');
    expect(text).toContain('3 of 7 events played');
    expect(text).not.toContain('takes the season');
  });

  it('only crowns a winner once every event is in', () => {
    const text = season({ eventsPlayed: 7, eventsScheduled: 7 }) as string;
    expect(text).toContain('takes the season on 12 points');
  });

  it('reports the Championship separately from the points race', () => {
    // They are different prizes and the same person need not win both.
    const text = season({ championName: 'Someone Else' }) as string;
    expect(text).toContain('Championship: **Someone Else**');
  });

  it('picks the round of the year and says where it happened', () => {
    const text = season({
      rounds: [
        { ...r({ playerName: 'Ann', netScore: -1 }), eventLabel: 'Grandview' },
        { ...r({ playerName: 'Bob', netScore: -7 }), eventLabel: 'Otter Creek' },
      ],
    }) as string;
    expect(text).toContain('Round of the year: **Bob**, -7 net at Otter Creek');
  });

  it('ignores rounds nobody played when picking superlatives', () => {
    const text = season({
      rounds: [
        {
          ...r({ playerName: 'Absent', netScore: -99, trueScore: null }),
          eventLabel: 'Nowhere',
        },
        { ...r({ playerName: 'Real', netScore: -2 }), eventLabel: 'Grandview' },
      ],
    }) as string;
    expect(text).toContain('**Real**');
    expect(text).not.toContain('Absent');
  });
});

describe('fitToDiscord', () => {
  it('leaves a short message alone', () => {
    expect(fitToDiscord('hello')).toBe('hello');
  });

  it('never returns more than Discord will accept', () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
    expect(long.length).toBeGreaterThan(DISCORD_LIMIT);
    expect(fitToDiscord(long).length).toBeLessThanOrEqual(DISCORD_LIMIT);
  });

  it('cuts at a line break rather than mid-sentence', () => {
    const long = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
    const out = fitToDiscord(long);
    expect(out.endsWith('\n…')).toBe(true);
    // The last surviving line is whole.
    const lines = out.split('\n');
    expect(lines[lines.length - 2]).toMatch(/^line \d+$/);
  });

  it('still truncates something with no line breaks to cut at', () => {
    const out = fitToDiscord('x'.repeat(3000));
    expect(out.length).toBeLessThanOrEqual(DISCORD_LIMIT);
  });
});
