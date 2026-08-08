import { describe, expect, it } from 'vitest';
import {
  careerSummary,
  careerTotals,
  isPlayed,
  seasonLines,
  toParWords,
  type CareerRound,
} from './career';

/** A played round, with only the fields a test cares about overridden. */
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

describe('isPlayed', () => {
  it('counts a round only when a real stroke count exists', () => {
    expect(isPlayed(round({ trueScore: 8 }))).toBe(true);
    expect(isPlayed(round({ trueScore: 0 }))).toBe(true);
    expect(isPlayed(round({ trueScore: null }))).toBe(false);
  });
});

describe('seasonLines', () => {
  it('groups rounds by year, oldest first', () => {
    const lines = seasonLines([
      round({ year: 2025 }),
      round({ year: 2023 }),
      round({ year: 2024 }),
    ]);
    expect(lines.map((l) => l.year)).toEqual([2023, 2024, 2025]);
  });

  it('averages scoring over played rounds only', () => {
    const lines = seasonLines([
      round({ netScore: 4, trueScore: 9 }),
      round({ netScore: 8, trueScore: 13 }),
      // A missed week: place and points, but no strokes.
      round({ netScore: null, trueScore: null, place: 9, eventPoints: 8 }),
    ]);

    expect(lines[0].rounds).toBe(2);
    expect(lines[0].avgNet).toBe(6);
    expect(lines[0].avgScore).toBe(11);
    expect(lines[0].bestNet).toBe(4);
  });

  it('still counts the points from a missed week, because last place costs you', () => {
    const lines = seasonLines([
      round({ eventPoints: 3 }),
      round({ trueScore: null, netScore: null, eventPoints: 8 }),
    ]);
    expect(lines[0].points).toBe(11);
  });

  it('reports a season with a handicap but no rounds', () => {
    const lines = seasonLines([], [{ year: 2022, fs: 12 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0].rounds).toBe(0);
    expect(lines[0].handicap).toBe(12);
    expect(lines[0].avgNet).toBeNull();
    expect(lines[0].points).toBeNull();
  });

  it('marks whether the Championship was won or merely played', () => {
    const won = seasonLines([round({ eventType: 'championship', place: 1 })]);
    const played = seasonLines([round({ eventType: 'championship', place: 5 })]);
    const absent = seasonLines([round({ eventType: 'event', place: 1 })]);

    expect(won[0].championship).toBe('won');
    expect(played[0].championship).toBe('played');
    expect(absent[0].championship).toBeNull();
  });

  it('attaches each season its own handicap', () => {
    const lines = seasonLines(
      [round({ year: 2023 }), round({ year: 2024 })],
      [
        { year: 2023, fs: 14 },
        { year: 2024, fs: 11 },
      ],
    );
    expect(lines.map((l) => l.handicap)).toEqual([14, 11]);
  });
});

describe('careerTotals', () => {
  it('counts wins, podiums and championships separately', () => {
    const totals = careerTotals([
      round({ place: 1 }),
      round({ place: 3 }),
      round({ place: 1, eventType: 'championship' }),
      round({ place: 7 }),
    ]);

    expect(totals.rounds).toBe(4);
    expect(totals.wins).toBe(2);
    expect(totals.podiums).toBe(3);
    expect(totals.championships).toBe(1);
  });

  it('spans first to last year of played rounds', () => {
    const totals = careerTotals([
      round({ year: 2019 }),
      round({ year: 2026 }),
      round({ year: 2022 }),
    ]);
    expect(totals.firstYear).toBe(2019);
    expect(totals.lastYear).toBe(2026);
    expect(totals.seasons).toBe(3);
  });

  it('is empty-safe', () => {
    const totals = careerTotals([]);
    expect(totals.rounds).toBe(0);
    expect(totals.avgNet).toBeNull();
    expect(totals.bestNet).toBeNull();
    expect(totals.firstYear).toBeNull();
  });
});

describe('toParWords', () => {
  it('reads the way golfers say it', () => {
    expect(toParWords(0)).toBe('level par');
    expect(toParWords(4.2)).toBe('4.2 over par');
    expect(toParWords(-2)).toBe('2 under par');
  });
});

describe('careerSummary', () => {
  /** One chapter, built from its own rounds and handicaps. */
  function chapter(
    label: string,
    rounds: CareerRound[],
    handicaps: { year: number; fs: number }[] = [],
  ) {
    return { label, rounds, lines: seasonLines(rounds, handicaps) };
  }

  it('says so plainly when a player has never posted a score', () => {
    const text = careerSummary({
      name: 'New Guy',
      chapters: [chapter('Iowa', [])],
      currentYear: 2026,
    });
    expect(text).toBe("New Guy is on the roster but hasn't posted a score yet.");
  });

  it('opens with rounds and seasons', () => {
    const text = careerSummary({
      name: 'Josh Ingalls',
      chapters: [chapter('Iowa', [round({ year: 2024 }), round({ year: 2025 })])],
      currentYear: 2026,
    });
    expect(text).toContain('Josh Ingalls has played 2 rounds over 2 seasons');
    expect(text).toContain('between 2024 and 2025');
  });

  it('names every chapter when a player has appeared in more than one', () => {
    const text = careerSummary({
      name: 'Tim Paccione',
      chapters: [chapter('Iowa', [round()]), chapter('Seattle', [round()])],
      currentYear: 2026,
    });
    expect(text).toContain('across Iowa and Seattle');
  });

  it('pools rounds and wins across chapters', () => {
    const text = careerSummary({
      name: 'Both Chapters',
      chapters: [
        chapter('Iowa', [round({ place: 1 }), round({ place: 5 })]),
        chapter('Seattle', [round({ place: 1 })]),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('3 rounds');
    expect(text).toContain('2 event wins');
  });

  it('lists championships with the years they were won', () => {
    const text = careerSummary({
      name: 'Bill Ice',
      chapters: [
        chapter('Iowa', [
          round({ year: 2022, eventType: 'championship', place: 1 }),
          round({ year: 2023 }),
        ]),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('1 Championship (2022)');
  });

  it('falls back to podiums when there are no wins', () => {
    const text = careerSummary({
      name: 'Nearly Man',
      chapters: [chapter('Iowa', [round({ place: 2 }), round({ place: 3 })])],
      currentYear: 2026,
    });
    expect(text).toContain('No wins yet');
    expect(text).toContain('2 top-three finishes');
  });

  it('picks the peak season on scoring, not on points total', () => {
    // 2024 has more events so a bigger points pile, but worse scoring.
    const text = careerSummary({
      name: 'Peak Finder',
      chapters: [
        chapter('Iowa', [
          round({ year: 2024, netScore: 9, eventPoints: 1 }),
          round({ year: 2024, netScore: 9, eventPoints: 1 }),
          round({ year: 2024, netScore: 9, eventPoints: 1 }),
          round({ year: 2025, netScore: 2, eventPoints: 5 }),
          round({ year: 2025, netScore: 2, eventPoints: 5 }),
        ]),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('sharpest season was 2025');
    expect(text).toContain('2 over par');
  });

  it('resolves the peak season inside a chapter and says which one', () => {
    // Blending these two 2026 halves would average to 3.5 and wrongly crown
    // 2025. The peak is a rate stat, so it has to stay inside its chapter.
    const text = careerSummary({
      name: 'Split Season',
      chapters: [
        chapter('Iowa', [
          round({ year: 2025, netScore: 3 }),
          round({ year: 2025, netScore: 3 }),
          round({ year: 2026, netScore: 1 }),
          round({ year: 2026, netScore: 1 }),
        ]),
        chapter('Seattle', [
          round({ year: 2026, netScore: 6 }),
          round({ year: 2026, netScore: 6 }),
        ]),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('sharpest season was 2026 in Iowa');
    expect(text).toContain('1 over par');
  });

  it('reads the handicap from the chapter played most, never a blend', () => {
    // Both chapters have a 2026 handicap. Merging them would silently drop
    // one; the busier chapter is the honest answer.
    const text = careerSummary({
      name: 'Two Handicaps',
      chapters: [
        chapter(
          'Iowa',
          [round({ year: 2019 }), round({ year: 2020 }), round({ year: 2026 })],
          [
            { year: 2019, fs: 18 },
            { year: 2026, fs: 11 },
          ],
        ),
        chapter('Seattle', [round({ year: 2026 })], [{ year: 2026, fs: 13 }]),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('down from 18 in 2019 to 11 in 2026');
    expect(text).toContain('in Iowa');
    expect(text).not.toContain('to 13 in 2026');
  });

  it('reads a falling handicap as improvement', () => {
    const text = careerSummary({
      name: 'Getting Better',
      chapters: [
        chapter(
          'Iowa',
          [round({ year: 2023 }), round({ year: 2025 })],
          [
            { year: 2023, fs: 16 },
            { year: 2025, fs: 9 },
          ],
        ),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('down from 16 in 2023 to 9 in 2025');
  });

  it('reads a rising handicap the other way', () => {
    const text = careerSummary({
      name: 'Getting Worse',
      chapters: [
        chapter(
          'Iowa',
          [round({ year: 2023 }), round({ year: 2025 })],
          [
            { year: 2023, fs: 8 },
            { year: 2025, fs: 15 },
          ],
        ),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('drifted the other way');
  });

  it('calls a flat handicap steady rather than inventing a trend', () => {
    const text = careerSummary({
      name: 'Steady Eddie',
      chapters: [
        chapter(
          'Iowa',
          [round({ year: 2023 }), round({ year: 2025 })],
          [
            { year: 2023, fs: 10 },
            { year: 2025, fs: 11 },
          ],
        ),
      ],
      currentYear: 2026,
    });
    expect(text).toContain('steady off 11');
  });

  it('notes when a player has stopped appearing', () => {
    const text = careerSummary({
      name: 'Long Gone',
      chapters: [chapter('Iowa', [round({ year: 2019 }), round({ year: 2020 })])],
      currentYear: 2026,
    });
    expect(text).toContain('Last seen on a card in 2020');
  });

  it('stays quiet about form for a player with a single round', () => {
    const text = careerSummary({
      name: 'One And Done',
      chapters: [chapter('Iowa', [round()])],
      currentYear: 2024,
    });
    expect(text).toContain('1 round over 1 season');
    expect(text).not.toContain('sharpest season');
    expect(text).not.toContain('Career best round');
  });

  it('never claims a title the data does not contain', () => {
    const text = careerSummary({
      name: 'Mid Pack',
      chapters: [chapter('Iowa', [round({ place: 4 }), round({ place: 6 })])],
      currentYear: 2026,
    });
    expect(text).not.toMatch(/Championship/i);
    expect(text).not.toMatch(/win/i);
  });
});
