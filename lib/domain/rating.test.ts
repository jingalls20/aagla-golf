import { describe, expect, it } from 'vitest';
import { buildRatings, MIN_DEVIATION, MIN_ROUNDS, type RatingRound } from './rating';

function round(over: Partial<RatingRound> = {}): RatingRound {
  const name = over.name ?? 'Player';
  return {
    playerId: `p-${name}`,
    personKey: name.toLowerCase(),
    name,
    photoUrl: null,
    chapterLabel: 'Iowa',
    leagueSlug: 'iowa',
    year: 2026,
    eventId: 'e1',
    eventType: 'event',
    grossScore: 10,
    ...over,
  };
}

/** One event, several players, each with a gross score. */
function event(year: number, id: string, field: [string, number | null][]) {
  return field.map(([name, gross]) =>
    round({
      name,
      personKey: name.toLowerCase(),
      year,
      eventId: id,
      grossScore: gross,
    }),
  );
}

/** Enough events for everyone named to clear the provisional threshold. */
function season(year: number, field: [string, number][], events = MIN_ROUNDS) {
  return Array.from({ length: events }, (_, i) =>
    event(year, `${year}-${i}`, field),
  ).flat();
}

describe('buildRatings', () => {
  it('leaves out a player who never actually faced anyone', () => {
    // A field of one is not a contest, so there is nothing to rate.
    const rows = buildRatings([
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...event(2026, 'solo', [['Cal', 1]]),
    ]);
    expect(rows.find((r) => r.name === 'Cal')).toBeUndefined();
  });

  it('says nothing when nobody has played', () => {
    expect(buildRatings([])).toEqual([]);
    expect(buildRatings([round({ grossScore: null })])).toEqual([]);
  });

  it('rates the better player above the worse one', () => {
    const rows = buildRatings(
      season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
    );
    expect(rows.map((r) => r.name)).toEqual(['Ann', 'Bob']);
    expect(rows[0].rating).toBeGreaterThan(rows[1].rating);
  });

  it('ranks only players past the provisional threshold', () => {
    const rows = buildRatings([
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...event(2026, 'one-off', [
        ['Cal', 1],
        ['Bob', 12],
      ]),
    ]);
    const cal = rows.find((r) => r.name === 'Cal');
    expect(cal?.provisional).toBe(true);
    expect(cal?.rank).toBeNull();
    expect(rows.find((r) => r.name === 'Ann')?.rank).toBe(1);
  });

  it('treats a matched score as a draw rather than a win', () => {
    const rows = buildRatings(
      season(2026, [
        ['Ann', 5],
        ['Bob', 5],
      ]),
    );
    expect(rows[0].rating).toBe(rows[1].rating);
  });

  it('ignores a round nobody played', () => {
    const rows = buildRatings([
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...event(2026, 'absent', [
        ['Ann', null],
        ['Bob', 3],
      ]),
    ]);
    expect(rows.find((r) => r.name === 'Ann')?.rounds).toBe(MIN_ROUNDS);
  });

  it('beating a strong player is worth more than beating a weak one', () => {
    // Zoe beats Bob, who loses to everyone. Ann beats Cal, who beats Bob.
    const base = [
      ...season(2025, [
        ['Cal', 4],
        ['Bob', 12],
      ]),
      ...season(2025, [
        ['Zoe', 4],
        ['Bob', 12],
      ]),
    ];
    const rows = buildRatings([
      ...base,
      ...season(2026, [
        ['Ann', 3],
        ['Cal', 6],
      ]),
      ...season(2026, [
        ['Zoe', 3],
        ['Bob', 12],
      ]),
    ]);
    const ann = rows.find((r) => r.name === 'Ann')!;
    const zoe = rows.find((r) => r.name === 'Zoe')!;
    expect(ann.rating).toBeGreaterThan(zoe.rating);
  });

  it('carries a wider deviation for somebody with fewer rounds', () => {
    const rows = buildRatings([
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...event(2026, 'x', [
        ['Cal', 4],
        ['Ann', 5],
      ]),
    ]);
    const ann = rows.find((r) => r.name === 'Ann')!;
    const cal = rows.find((r) => r.name === 'Cal')!;
    expect(cal.deviation).toBeGreaterThan(ann.deviation);
  });

  it('does not run a crowded card past the deviation floor', () => {
    // The bug this pins: pairings inside an event were each counted as an
    // independent game, so one twelve-player card supplied eleven games'
    // worth of certainty. A single season of them drove everybody onto the
    // floor, and the +/- column stopped telling one player from another.
    const field: [string, number][] = Array.from({ length: 12 }, (_, i) => [
      `P${i}`,
      i,
    ]);
    const rows = buildRatings(season(2026, field));

    expect(rows.length).toBe(12);
    for (const row of rows) {
      expect(row.deviation).toBeGreaterThan(MIN_DEVIATION);
    }
  });

  it('still moves a rating further for beating a big field', () => {
    // The other half of the same rule: damping the evidence must not flatten
    // it. Dividing the field out entirely made a twelve-player win worth
    // exactly what a two-player one was, to the point; winning against
    // eleven is the bigger claim and the rating has to say so.
    const wide = buildRatings(
      event(
        2026,
        'crowded',
        Array.from({ length: 12 }, (_, i) => [`P${i}`, i] as [string, number]),
      ),
    );
    const narrow = buildRatings(
      event(2026, 'pair', [
        ['Q0', 0],
        ['Q1', 1],
      ]),
    );

    const winnerWide = wide.find((r) => r.name === 'P0')?.rating as number;
    const winnerNarrow = narrow.find((r) => r.name === 'Q0')?.rating as number;
    expect(winnerWide).toBeGreaterThan(winnerNarrow);
  });

  it('only looks at the last three seasons', () => {
    const rows = buildRatings([
      ...season(2019, [
        ['Ghost', 1],
        ['Bob', 20],
      ]),
      ...season(2024, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...season(2025, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
    ]);
    expect(rows.find((r) => r.name === 'Ghost')).toBeUndefined();
  });

  it('gives a Championship more pull than an ordinary event', () => {
    const ordinary = buildRatings(
      season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]).map((r) => ({
        ...r,
        eventType: 'event' as const,
      })),
    );
    const titles = buildRatings(
      season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]).map((r) => ({
        ...r,
        eventType: 'championship' as const,
      })),
    );
    expect(titles[0].rating).toBeGreaterThan(ordinary[0].rating);
  });

  it('joins the chapters into one rating for a player who plays both', () => {
    const rows = buildRatings([
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...season(2026, [
        ['Ann', 2],
        ['Cal', 9],
      ]).map((r) => ({
        ...r,
        chapterLabel: 'Seattle',
        leagueSlug: 'seattle',
        playerId: `seattle-${r.name}`,
      })),
    ]);
    const ann = rows.find((r) => r.name === 'Ann')!;
    expect(ann.chapters.map((c) => c.leagueSlug).sort()).toEqual(['iowa', 'seattle']);
    // One person, one rating, however many roster rows they hold.
    expect(rows.filter((r) => r.name === 'Ann')).toHaveLength(1);
  });

  it('reports a previous rating once there is a season to compare with', () => {
    const rows = buildRatings([
      ...season(2025, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
      ...season(2026, [
        ['Ann', 2],
        ['Bob', 9],
      ]),
    ]);
    expect(rows[0].previousRating).not.toBeNull();
  });
});
