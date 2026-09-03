import { describe, expect, it } from 'vitest';
import { buildHall, type HallSeasonInput } from './hall';

const player = (
  name: string,
  over: Partial<HallSeasonInput['champions'][number]> = {},
) => ({
  playerId: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  photoUrl: null,
  netScore: -1,
  seasonRank: 1,
  ...over,
});

const season = (over: Partial<HallSeasonInput> = {}): HallSeasonInput => ({
  year: 2020,
  where: 'Otter Creek',
  champions: [player('Ann Green')],
  runnerUp: { name: 'Bob Blue', netScore: 2 },
  fieldSize: 6,
  pointsWinners: [],
  ...over,
});

describe('buildHall', () => {
  it('reads newest season first', () => {
    const hall = buildHall([season({ year: 2019 }), season({ year: 2021 }), season()]);
    expect(hall.map((h) => h.year)).toEqual([2021, 2020, 2019]);
  });

  it('counts a player’s titles as the years go by', () => {
    const hall = buildHall([
      season({ year: 2018 }),
      season({ year: 2020 }),
      season({ year: 2024 }),
    ]);
    // Newest first, so the counts run backwards.
    expect(hall.map((h) => h.titleNumbers[0])).toEqual([3, 2, 1]);
  });

  it('calls a first title a first', () => {
    expect(buildHall([season()])[0].blurb).toContain("Ann Green's first Championship");
  });

  it('says how long it had been since the last one', () => {
    const hall = buildHall([season({ year: 2017 }), season({ year: 2021 })]);
    expect(hall[0].blurb).toContain('second Championship, and the first since 2017');
  });

  it('calls consecutive years back to back', () => {
    const hall = buildHall([season({ year: 2020 }), season({ year: 2021 })]);
    expect(hall[0].blurb).toContain('went back to back');
  });

  it('treats a tie as a shared title, counting for both', () => {
    const hall = buildHall([
      season({ champions: [player('Ann Green'), player('Cal Grey')] }),
    ]);
    expect(hall[0].shared).toBe(true);
    expect(hall[0].blurb).toContain('Ann Green and Cal Grey shared the title');
    expect(hall[0].titleNumbers).toEqual([1, 1]);
  });

  it('counts a shared title toward a later solo one', () => {
    const hall = buildHall([
      season({ year: 2020, champions: [player('Ann Green'), player('Cal Grey')] }),
      season({ year: 2022, champions: [player('Ann Green')] }),
    ]);
    expect(hall[0].titleNumbers).toEqual([2]);
    expect(hall[0].blurb).toContain('second Championship');
  });

  it('states the margin over the runner-up', () => {
    expect(buildHall([season()])[0].blurb).toContain('three strokes clear of Bob Blue');
  });

  it('says nothing about a margin when the runner-up has no score', () => {
    const hall = buildHall([
      season({ runnerUp: { name: 'Bob Blue', netScore: null } }),
    ]);
    expect(hall[0].blurb).not.toContain('from Bob Blue');
  });

  it('calls a one-stroke win a stroke, not strokes', () => {
    const hall = buildHall([season({ runnerUp: { name: 'Bob Blue', netScore: 0 } })]);
    expect(hall[0].blurb).toContain('one stroke clear');
  });

  it('claims no margin when the recorded scores do not support one', () => {
    // Real case: championships imported from the old sheet carry places that
    // do not always follow the net scores stored beside them.
    const hall = buildHall([
      season({
        champions: [player('Ann Green', { netScore: -5 })],
        runnerUp: { name: 'Bob Blue', netScore: -7 },
      }),
    ]);
    expect(hall[0].blurb).not.toContain('Bob Blue');
    expect(hall[0].blurb).not.toContain('stroke');
    expect(hall[0].blurb).toContain('first Championship');
  });

  it('marks the double when the champion also won the points', () => {
    const hall = buildHall([
      season({ pointsWinners: [{ playerId: 'ann-green', name: 'Ann Green' }] }),
    ]);
    expect(hall[0].blurb).toContain('the double');
  });

  it('does not say a lone champion twice when they doubled', () => {
    const hall = buildHall([
      season({ pointsWinners: [{ playerId: 'ann-green', name: 'Ann Green' }] }),
    ]);
    // Named once, in the opening sentence, and not again in the double.
    expect(hall[0].blurb.match(/Ann Green/g)).toHaveLength(1);
    expect(hall[0].blurb).toContain('the season points as well');
  });

  it('still names both when a shared title doubled', () => {
    const hall = buildHall([
      season({
        champions: [player('Ann Green'), player('Bob Blue')],
        pointsWinners: [
          { playerId: 'ann-green', name: 'Ann Green' },
          { playerId: 'bob-blue', name: 'Bob Blue' },
        ],
      }),
    ]);
    expect(hall[0].blurb).toContain('Ann Green and Bob Blue had already taken');
  });

  it('names the points winner when it was somebody else', () => {
    const hall = buildHall([
      season({
        champions: [player('Ann Green', { seasonRank: 4 })],
        pointsWinners: [{ playerId: 'zed', name: 'Zed Black' }],
      }),
    ]);
    expect(hall[0].blurb).toContain('Zed Black took the season points');
    expect(hall[0].blurb).toContain('champion fourth on the year');
  });

  it('marks the earliest season on record as such', () => {
    const hall = buildHall([season({ year: 2013 }), season({ year: 2014 })]);
    expect(hall[1].blurb).toContain('earliest Championship on record');
    expect(hall[0].blurb).not.toContain('earliest');
  });

  it('says nothing at all for a season with no champion', () => {
    expect(buildHall([season({ champions: [] })])[0].blurb).toBe('');
  });

  it('survives a season with no runner-up and no field recorded', () => {
    const hall = buildHall([season({ runnerUp: null, fieldSize: 0 })]);
    expect(hall[0].blurb).toContain('first Championship');
    expect(hall[0].blurb).not.toContain('field');
  });
});

describe('a named winner', () => {
  it('narrows a tie to one champion and says there was a playoff', () => {
    const hall = buildHall([
      season({
        champions: [player('Ann Green'), player('Cal Grey')],
        decidedBy: 'ann-green',
      }),
    ]);
    expect(hall[0].champions.map((c) => c.name)).toEqual(['Ann Green']);
    expect(hall[0].playoffLosers.map((c) => c.name)).toEqual(['Cal Grey']);
    expect(hall[0].shared).toBe(false);
    expect(hall[0].blurb).toContain('after a playoff with Cal Grey');
  });

  it('claims no margin when the card was level and a playoff settled it', () => {
    const hall = buildHall([
      season({
        champions: [player('Ann Green'), player('Cal Grey')],
        decidedBy: 'ann-green',
        runnerUp: { name: 'Bob Blue', netScore: 4 },
      }),
    ]);
    expect(hall[0].blurb).not.toContain('clear of');
  });

  it('counts the title only for the player who won the playoff', () => {
    const hall = buildHall([
      season({
        year: 2020,
        champions: [player('Ann Green'), player('Cal Grey')],
        decidedBy: 'ann-green',
      }),
      season({ year: 2022, champions: [player('Cal Grey')] }),
    ]);
    // Cal lost the 2020 playoff, so 2022 is a first title rather than a second.
    expect(hall[0].titleNumbers).toEqual([1]);
    expect(hall[0].blurb).toContain('first Championship');
  });

  it('leaves a season alone when nobody was named', () => {
    const hall = buildHall([
      season({ champions: [player('Ann Green'), player('Cal Grey')] }),
    ]);
    expect(hall[0].shared).toBe(true);
    expect(hall[0].playoffLosers).toEqual([]);
    expect(hall[0].blurb).toContain('shared the title');
  });

  it('stands even when the named winner is not among the tied players', () => {
    // An admin overriding a result the scores got wrong outright.
    const hall = buildHall([
      season({ champions: [player('Ann Green')], decidedBy: 'somebody-else' }),
    ]);
    expect(hall[0].champions.map((c) => c.name)).toEqual(['Ann Green']);
    expect(hall[0].playoffLosers).toEqual([]);
  });
});
