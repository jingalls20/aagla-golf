import { describe, expect, it } from 'vitest';
import {
  activePeople,
  buildRecords,
  SEASON_AVG_MIN_ROUNDS,
  type RecordPerson,
} from './records';
import type { CareerRound } from './career';
import type { PlayerStatus } from './types';

function round(over: Partial<CareerRound> = {}): CareerRound {
  return {
    year: 2024,
    eventType: 'event',
    eventName: 'Event',
    sequence: 1,
    trueScore: 10,
    fsApplied: 5,
    netScore: 5,
    place: 4,
    eventPoints: 3,
    ...over,
  };
}

function person(
  name: string,
  chapters: {
    label?: string;
    status?: PlayerStatus;
    rounds?: CareerRound[];
    handicaps?: { year: number; fs: number }[];
  }[],
): RecordPerson {
  return {
    key: name.toLowerCase(),
    name,
    photoUrl: null,
    chapters: chapters.map((c, i) => ({
      leagueId: `l${i}`,
      leagueSlug: `l${i}`,
      label: c.label ?? 'Iowa',
      playerId: `${name}-${i}`,
      // Active unless a test says otherwise: the roster filter is opt-in, so
      // every existing case should behave as it did before it existed.
      status: c.status ?? 'active',
      rounds: c.rounds ?? [],
      handicaps: c.handicaps ?? [],
    })),
  };
}

const boardOf = (people: RecordPerson[], key: string) =>
  buildRecords(people).find((b) => b.key === key)!;

describe('counting records', () => {
  it('adds a person’s chapters together', () => {
    const both = person('Two Chapters', [
      { label: 'Iowa', rounds: [round(), round(), round()] },
      { label: 'Seattle', rounds: [round(), round()] },
    ]);
    const one = person('One Chapter', [
      { rounds: [round(), round(), round(), round()] },
    ]);

    const b = boardOf([both, one], 'events');
    expect(b.tiers[0].value).toBe(5);
    expect(b.tiers[0].entries[0].name).toBe('Two Chapters');
    expect(b.tiers[0].entries[0].detail).toContain('Iowa + Seattle');
  });

  it('does not count a round nobody played', () => {
    const p = person('Absent', [
      { rounds: [round(), round({ trueScore: null, netScore: null })] },
    ]);
    expect(boardOf([p], 'events').tiers[0].value).toBe(1);
  });

  it('separates majors from championships', () => {
    const p = person('Winner', [
      {
        rounds: [
          round({ eventType: 'major', place: 1, year: 2020 }),
          round({ eventType: 'major', place: 1, year: 2021 }),
          round({ eventType: 'championship', place: 1, year: 2022 }),
          round({ eventType: 'event', place: 1, year: 2023 }),
        ],
      },
    ]);
    expect(boardOf([p], 'majors').tiers[0].value).toBe(2);
    expect(boardOf([p], 'majors').tiers[0].entries[0].detail).toBe('2020, 2021');
    expect(boardOf([p], 'championships').tiers[0].value).toBe(1);
  });

  it('leaves people with none of a thing off that board entirely', () => {
    const p = person('No Majors', [{ rounds: [round({ place: 4 })] }]);
    expect(boardOf([p], 'majors').tiers).toHaveLength(0);
  });
});

describe('ties', () => {
  it('gives every person on the best value joint hold of the record', () => {
    const a = person('Alice', [{ rounds: [round(), round()] }]);
    const b = person('Bob', [{ rounds: [round(), round()] }]);
    const c = person('Carol', [{ rounds: [round()] }]);

    const board = boardOf([a, b, c], 'events');
    expect(board.tiers[0].value).toBe(2);
    expect(board.tiers[0].entries.map((e) => e.name)).toEqual(['Alice', 'Bob']);
    expect(board.tiers[1].value).toBe(1);
  });

  it('orders a tie alphabetically, implying no ranking between them', () => {
    const z = person('Zoe', [{ rounds: [round()] }]);
    const a = person('Aaron', [{ rounds: [round()] }]);
    expect(boardOf([z, a], 'events').tiers[0].entries.map((e) => e.name)).toEqual([
      'Aaron',
      'Zoe',
    ]);
  });

  it('shows three distinct values, however many people share them', () => {
    const people = [
      person('A', [{ rounds: [round(), round(), round(), round()] }]),
      person('B', [{ rounds: [round(), round(), round()] }]),
      person('C', [{ rounds: [round(), round(), round()] }]),
      person('D', [{ rounds: [round(), round()] }]),
      person('E', [{ rounds: [round()] }]),
    ];
    const board = boardOf(people, 'events');
    expect(board.tiers.map((t) => t.value)).toEqual([4, 3, 2]);
    expect(board.tiers[1].entries).toHaveLength(2);
  });
});

describe('best-round records', () => {
  it('takes the best from whichever chapter it came from, and says which', () => {
    const p = person('Split', [
      { label: 'Iowa', rounds: [round({ netScore: 2, trueScore: 9 })] },
      {
        label: 'Seattle',
        rounds: [
          round({ netScore: -4, trueScore: 3, eventName: 'Bellevue', year: 2025 }),
        ],
      },
    ]);
    const net = boardOf([p], 'lowest-net');
    expect(net.tiers[0].value).toBe(-4);
    expect(net.tiers[0].entries[0].detail).toBe('Bellevue, 2025 · Seattle');
  });

  it('ranks lower as better', () => {
    const low = person('Low', [{ rounds: [round({ netScore: -6 })] }]);
    const high = person('High', [{ rounds: [round({ netScore: 3 })] }]);
    expect(boardOf([low, high], 'lowest-net').tiers[0].entries[0].name).toBe('Low');
  });

  it('names an unnamed event by its number', () => {
    const p = person('Unnamed', [
      { rounds: [round({ eventName: null, sequence: 4, netScore: 1 })] },
    ]);
    expect(boardOf([p], 'lowest-net').tiers[0].entries[0].detail).toContain('event #4');
  });

  it('scores gross and net independently', () => {
    const a = person('GrossKing', [{ rounds: [round({ trueScore: 1, netScore: 8 })] }]);
    const b = person('NetKing', [{ rounds: [round({ trueScore: 14, netScore: -3 })] }]);
    expect(boardOf([a, b], 'lowest-gross').tiers[0].entries[0].name).toBe('GrossKing');
    expect(boardOf([a, b], 'lowest-net').tiers[0].entries[0].name).toBe('NetKing');
  });
});

describe('lowest handicap', () => {
  it('takes the lowest across chapters and can go below scratch', () => {
    const p = person('Scratch', [
      {
        label: 'Iowa',
        rounds: [round({ year: 2019 })],
        handicaps: [{ year: 2020, fs: 4 }],
      },
      {
        label: 'Seattle',
        rounds: [round({ year: 2023 })],
        handicaps: [{ year: 2024, fs: -1 }],
      },
    ]);
    const b = boardOf([p], 'lowest-handicap');
    expect(b.tiers[0].value).toBe(-1);
    expect(b.tiers[0].entries[0].detail).toBe('2024 · Seattle');
  });
});

describe('handicap drops', () => {
  /** A handicap only counts once it was earned, so every season quoted below
   *  needs a played round in the year before it. */
  const earnedIn = (years: number[]) => years.map((y) => round({ year: y - 1 }));

  const journey = person('Journey', [
    {
      label: 'Iowa',
      rounds: earnedIn([2013, 2014, 2019, 2026]),
      handicaps: [
        { year: 2013, fs: 25 },
        { year: 2014, fs: 22 },
        { year: 2019, fs: 5 },
        { year: 2026, fs: 12 },
      ],
    },
  ]);

  it('turnaround takes the peak to a later low, ignoring the drift back', () => {
    const b = boardOf([journey], 'turnaround');
    expect(b.tiers[0].value).toBe(20);
    expect(b.tiers[0].entries[0].detail).toContain('25 in 2013 → 5 in 2019');
  });

  it('career improvement measures first season against the most recent', () => {
    expect(boardOf([journey], 'career-improvement').tiers[0].value).toBe(13);
  });

  it('single-season leap takes the biggest fall between consecutive seasons', () => {
    const b = boardOf([journey], 'best-leap');
    expect(b.tiers[0].value).toBe(17);
    expect(b.tiers[0].entries[0].detail).toContain('22 → 5 in 2019');
  });

  it('never subtracts one chapter’s handicap from another’s', () => {
    // Iowa alone drops 2; Seattle alone drops 1. Crossing them would read as
    // 24, a figure nobody achieved.
    const p = person('Crossed', [
      {
        label: 'Iowa',
        rounds: [round({ year: 2023 }), round({ year: 2024 })],
        handicaps: [
          { year: 2024, fs: 25 },
          { year: 2025, fs: 23 },
        ],
      },
      {
        label: 'Seattle',
        rounds: [round({ year: 2023 }), round({ year: 2024 })],
        handicaps: [
          { year: 2024, fs: 2 },
          { year: 2025, fs: 1 },
        ],
      },
    ]);
    expect(boardOf([p], 'turnaround').tiers[0].value).toBe(2);
  });

  it('ignores a handicap that only ever rose', () => {
    const worse = person('Worse', [
      {
        rounds: [round({ year: 2019 }), round({ year: 2020 })],
        handicaps: [
          { year: 2020, fs: 5 },
          { year: 2021, fs: 12 },
        ],
      },
    ]);
    expect(boardOf([worse], 'turnaround').tiers).toHaveLength(0);
    expect(boardOf([worse], 'career-improvement').tiers).toHaveLength(0);
    expect(boardOf([worse], 'best-leap').tiers).toHaveLength(0);
  });

  it('needs two seasons before any drop exists', () => {
    const one = person('Rookie', [
      { rounds: [round({ year: 2024 })], handicaps: [{ year: 2025, fs: 14 }] },
    ]);
    expect(boardOf([one], 'turnaround').tiers).toHaveLength(0);
  });
});

describe('handicaps that were never earned', () => {
  it('ignores a first season, since there was nothing to improve on yet', () => {
    // 2022 is the rookie year: no 2021 rounds, so its handicap is the rule's
    // placeholder rather than a figure anyone played to.
    const p = person('Rookie', [
      {
        rounds: [round({ year: 2022 }), round({ year: 2023 })],
        handicaps: [
          { year: 2022, fs: 16 },
          { year: 2023, fs: 14 },
          { year: 2024, fs: 9 },
        ],
      },
    ]);
    // Only 2023 and 2024 were earned, so the drop is 5 rather than 7.
    expect(boardOf([p], 'turnaround').tiers[0].value).toBe(5);
  });

  it('ignores a placeholder mid-career, after a season sat out', () => {
    // Played 2021, so 2022 is earned. Sat out 2022-2024, so 2025 defaults to
    // 0 -- reading 16 down to that 0 would be a 16-stroke turnaround that
    // never happened.
    const p = person('Comeback', [
      {
        rounds: [round({ year: 2021 }), round({ year: 2022 })],
        handicaps: [
          { year: 2022, fs: 16 },
          { year: 2025, fs: 0 },
          { year: 2026, fs: 14 },
        ],
      },
    ]);
    expect(boardOf([p], 'turnaround').tiers).toHaveLength(0);
    expect(boardOf([p], 'best-leap').tiers).toHaveLength(0);
  });

  it('keeps a genuine zero that was earned from real rounds', () => {
    const scratch = person('Scratch', [
      {
        rounds: [round({ year: 2023 }), round({ year: 2024 })],
        handicaps: [
          { year: 2024, fs: 6 },
          { year: 2025, fs: 0 },
        ],
      },
    ]);
    expect(boardOf([scratch], 'lowest-handicap').tiers[0].value).toBe(0);
    expect(boardOf([scratch], 'turnaround').tiers[0].value).toBe(6);
  });

  it('never lets a placeholder win the lowest-handicap record', () => {
    const placeholder = person('Never Played Before', [
      { rounds: [round({ year: 2025 })], handicaps: [{ year: 2025, fs: 0 }] },
    ]);
    const real = person('Real', [
      { rounds: [round({ year: 2024 })], handicaps: [{ year: 2025, fs: 3 }] },
    ]);
    const b = boardOf([placeholder, real], 'lowest-handicap');
    expect(b.tiers[0].entries[0].name).toBe('Real');
    expect(b.tiers[0].value).toBe(3);
  });

  it('does not count a Championship round as having played the season', () => {
    // Championships never feed a handicap, so playing only one leaves the
    // next season's figure a placeholder.
    const p = person('Champ Only', [
      {
        rounds: [round({ year: 2024, eventType: 'championship' })],
        handicaps: [{ year: 2025, fs: 12 }],
      },
    ]);
    expect(boardOf([p], 'lowest-handicap').tiers).toHaveLength(0);
  });
});

describe('best season average', () => {
  const season = (year: number, nets: number[], label = 'Iowa') => ({
    label,
    rounds: nets.map((netScore, i) =>
      round({ year, netScore, sequence: i + 1, trueScore: netScore + 5 }),
    ),
  });

  it('needs the minimum rounds to qualify', () => {
    const thin = person('Thin', [season(2024, [-8, -8, -8, -8])]);
    expect(boardOf([thin], 'season-avg').tiers).toHaveLength(0);

    const enough = person('Enough', [season(2024, [-8, -8, -8, -8, -8])]);
    expect(boardOf([enough], 'season-avg').tiers[0].value).toBe(-8);
  });

  it('lets a full season outrank a hot few weeks', () => {
    const partial = person('Partial', [season(2024, [-9, -9, -9, -9])]);
    const full = person('Full', [season(2024, [-2, -2, -2, -2, -2, -2])]);
    const b = boardOf([partial, full], 'season-avg');
    expect(b.tiers[0].entries[0].name).toBe('Full');
    expect(b.tiers.some((t) => t.entries.some((e) => e.name === 'Partial'))).toBe(
      false,
    );
  });

  it('reports the season, chapter and how many rounds it took', () => {
    const p = person('Detailed', [season(2019, [0, 0, 0, 0, 0], 'Seattle')]);
    expect(boardOf([p], 'season-avg').tiers[0].entries[0].detail).toBe(
      '2019 · Seattle · 5 rounds',
    );
  });

  it('resolves each season inside its own chapter', () => {
    // Same year in both chapters; averaging them together would give -1.
    const p = person('Both', [
      season(2026, [-5, -5, -5, -5, -5], 'Iowa'),
      season(2026, [3, 3, 3, 3, 3], 'Seattle'),
    ]);
    expect(boardOf([p], 'season-avg').tiers[0].value).toBe(-5);
  });

  it('exposes the threshold it used', () => {
    expect(SEASON_AVG_MIN_ROUNDS).toBe(5);
    expect(boardOf([], 'season-avg').blurb).toContain('minimum 5 rounds');
  });
});

describe('the board as a whole', () => {
  it('produces every record in reading order, even with nobody to fill them', () => {
    // The order is deliberate and part of the design, not an accident of how
    // the array was typed: winning first (hardest won first), then longevity,
    // then scoring, then the handicap group. Pinned so a later edit that
    // shuffles the array has to say so out loud.
    const boards = buildRecords([]);
    expect(boards.map((b) => b.key)).toEqual([
      'championships',
      'majors',
      'event-wins',
      'total-wins',
      'events',
      'lowest-net',
      'lowest-gross',
      'season-avg',
      'lowest-handicap',
      'turnaround',
      'career-improvement',
      'best-leap',
    ]);
    expect(boards.every((b) => b.tiers.length === 0)).toBe(true);
  });

  it('carries every chapter a person belongs to, so the page can link them', () => {
    const p = person('Linked', [
      { label: 'Iowa', rounds: [round()] },
      { label: 'Seattle', rounds: [round()] },
    ]);
    const e = boardOf([p], 'events').tiers[0].entries[0];
    expect(e.chapters.map((c) => c.playerId)).toEqual(['Linked-0', 'Linked-1']);
  });
});

describe('current members only', () => {
  it('drops people who are inactive everywhere', () => {
    const gone = person('Retired', [
      { status: 'inactive', rounds: [round(), round()] },
    ]);
    const here = person('Playing', [{ rounds: [round()] }]);

    expect(activePeople([gone, here]).map((p) => p.name)).toEqual(['Playing']);
  });

  it('keeps someone active in one chapter and inactive in the other', () => {
    const p = person('Moved', [
      { label: 'Iowa', status: 'inactive', rounds: [round()] },
      { label: 'Seattle', status: 'active', rounds: [round()] },
    ]);

    expect(activePeople([p])).toHaveLength(1);
  });

  it('still counts the career they had in the chapter they left', () => {
    const p = person('Moved', [
      { label: 'Iowa', status: 'inactive', rounds: [round(), round(), round()] },
      { label: 'Seattle', status: 'active', rounds: [round()] },
    ]);

    // Four rounds, not the one they have posted since moving: the filter
    // decides who appears, never which of their rounds count.
    expect(boardOf(activePeople([p]), 'events').tiers[0].value).toBe(4);
  });

  it('hands the record to the next player when the holder has left', () => {
    const gone = person('Retired', [
      { status: 'inactive', rounds: [round(), round(), round()] },
    ]);
    const here = person('Playing', [{ rounds: [round(), round()] }]);

    expect(boardOf([gone, here], 'events').tiers[0].entries[0].name).toBe('Retired');

    const filtered = boardOf(activePeople([gone, here]), 'events');
    expect(filtered.tiers[0].entries[0].name).toBe('Playing');
    expect(filtered.tiers[0].value).toBe(2);
  });

  it('re-forms ties on the smaller field rather than hiding a row', () => {
    // Three people level at the top. Remove one and the record is still
    // shared -- by two, and the board has to say two.
    const people = [
      person('Gone', [{ status: 'inactive', rounds: [round(), round()] }]),
      person('Here A', [{ rounds: [round(), round()] }]),
      person('Here B', [{ rounds: [round(), round()] }]),
    ];

    expect(boardOf(people, 'events').tiers[0].entries).toHaveLength(3);
    expect(boardOf(activePeople(people), 'events').tiers[0].entries).toHaveLength(2);
  });

  it('leaves the board empty rather than erroring when nobody is active', () => {
    const people = [person('Retired', [{ status: 'inactive', rounds: [round()] }])];
    const boards = buildRecords(activePeople(people));
    expect(boards.every((b) => b.tiers.length === 0)).toBe(true);
  });

  it('does not change the board when everybody is active', () => {
    const people = [
      person('A', [{ rounds: [round(), round()] }]),
      person('B', [{ rounds: [round()] }]),
    ];
    expect(buildRecords(activePeople(people))).toEqual(buildRecords(people));
  });
});

describe('win records', () => {
  const winner = person('Winner', [
    {
      rounds: [
        round({ eventType: 'event', place: 1, year: 2020 }),
        round({ eventType: 'event', place: 1, year: 2021 }),
        round({ eventType: 'event', place: 3, year: 2021 }),
        round({ eventType: 'major', place: 1, year: 2022 }),
        round({ eventType: 'championship', place: 1, year: 2023 }),
      ],
    },
  ]);

  it('counts ordinary event wins without majors or championships', () => {
    expect(boardOf([winner], 'event-wins').tiers[0].value).toBe(2);
  });

  it('counts every kind of win on the total board', () => {
    expect(boardOf([winner], 'total-wins').tiers[0].value).toBe(4);
  });

  it('breaks the total down so nobody adds it to the boards above it', () => {
    expect(boardOf([winner], 'total-wins').tiers[0].entries[0].detail).toBe(
      '2 events, 1 major, 1 Championship',
    );
  });

  it('names only the kinds a player actually has', () => {
    const p = person('Majors Only', [
      { rounds: [round({ eventType: 'major', place: 1 })] },
    ]);
    expect(boardOf([p], 'total-wins').tiers[0].entries[0].detail).toBe('1 major');
  });

  it('leaves someone who has never won off both win boards', () => {
    const p = person('Runner Up', [{ rounds: [round({ place: 2 })] }]);
    expect(boardOf([p], 'event-wins').tiers).toHaveLength(0);
    expect(boardOf([p], 'total-wins').tiers).toHaveLength(0);
  });

  it('does not count a win in a round nobody played', () => {
    const p = person('Absent', [
      { rounds: [round({ place: 1, trueScore: null, netScore: null })] },
    ]);
    expect(boardOf([p], 'total-wins').tiers).toHaveLength(0);
  });

  it('adds wins across both chapters', () => {
    const p = person('Both', [
      { label: 'Iowa', rounds: [round({ eventType: 'event', place: 1 })] },
      { label: 'Seattle', rounds: [round({ eventType: 'major', place: 1 })] },
    ]);
    expect(boardOf([p], 'total-wins').tiers[0].value).toBe(2);
  });
});
