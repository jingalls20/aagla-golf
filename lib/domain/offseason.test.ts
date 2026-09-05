import { describe, expect, it } from 'vitest';
import {
  seasonRecapView,
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
    eventsPlayed: 4,
    seasonRank: 1,
    ...over,
  };
}

function round(name: string, over: Partial<RecapRound> = {}): RecapRound {
  return {
    playerId: name.toLowerCase(),
    playerName: name,
    eventId: 'e1',
    eventLabel: 'Toad Valley',
    eventType: 'event',
    sequence: 1,
    trueScore: 12,
    netScore: 2,
    place: 3,
    eventPoints: 1.5,
    ...over,
  };
}

/** A four-event season where `winner` wins every event and `chaser` is 2nd. */
function simpleSeason(winner: string, chaser: string): RecapRound[] {
  return [1, 2, 3, 4].flatMap((seq) => [
    round(winner, {
      sequence: seq,
      eventId: `e${seq}`,
      place: 1,
      eventPoints: 0,
      netScore: -2,
    }),
    round(chaser, {
      sequence: seq,
      eventId: `e${seq}`,
      place: 2,
      eventPoints: 1,
      netScore: 1,
    }),
  ]);
}

function input(over: Partial<SeasonRecapInput> = {}): SeasonRecapInput {
  return {
    year: 2026,
    standings: [
      standing('Ann Green', 0, { seasonRank: 1 }),
      standing('Bob Blue', 4, { seasonRank: 2 }),
    ],
    rounds: simpleSeason('Ann Green', 'Bob Blue'),
    championIds: [],
    eventsPlayed: 4,
    eventsScheduled: 4,
    ...over,
  };
}

describe('seasonRecapView', () => {
  it('says nothing happened when nothing was played', () => {
    const view = seasonRecapView(input({ rounds: [], standings: [] }));
    expect(view.summary).toBe('No rounds were recorded in 2026.');
    expect(view.paragraphs).toHaveLength(1);
  });

  it('leads with the person and what they won', () => {
    const view = seasonRecapView(input());
    expect(view.paragraphs[0]).toMatch(/^Ann Green won the 2026 season/);
  });

  it('stacks the Championship into the opening when the same player took it', () => {
    const view = seasonRecapView(
      input({
        championIds: ['ann green'],
        rounds: [
          ...simpleSeason('Ann Green', 'Bob Blue'),
          round('Ann Green', {
            sequence: 5,
            eventId: 'champ',
            eventLabel: 'Otter Creek',
            eventType: 'championship',
            place: 1,
            eventPoints: 0,
            netScore: -1,
          }),
        ],
      }),
    );
    expect(view.paragraphs[0]).toContain(
      'Ann Green won the Championship at Otter Creek, and with it the 2026 season',
    );
  });

  it('names a margin only when there is one', () => {
    const view = seasonRecapView(input());
    expect(view.paragraphs[0]).toContain('four points clear of Bob Blue');

    const tied = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 4, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 1 }),
        ],
      }),
    );
    expect(tied.summary).toContain('finished 2026 level on four points and shared');
    expect(tied.summary).not.toContain('clear of');
  });

  it('uses the full name once, then the surname', () => {
    // The register golf writing uses -- "Musselman was relentless", not
    // "Taylor was relentless" -- and the reason this app needs no pronouns.
    const view = seasonRecapView(
      input({
        history: [
          {
            playerId: 'ann green',
            priorTitleYears: [],
            careerWins: 6,
            priorSeasons: 3,
          },
        ],
      }),
    );
    expect(view.paragraphs[0]).toContain('Ann Green won');
    expect(view.paragraphs[0]).toContain("Green's six career wins");
    expect(view.paragraphs[1]).toMatch(/^Green /);
  });

  it('reports the scoring line and the shape of the year', () => {
    const view = seasonRecapView(input());
    expect(view.paragraphs[1]).toContain('−2, −2, −2, −2');
    expect(view.paragraphs[1]).toContain('every one of them a top-three finish');
  });

  it('never prints a placeholder event id as a venue', () => {
    // Unnamed events fall back to `#97` for table headers, which reads as
    // broken inside a sentence.
    const view = seasonRecapView(
      input({
        championIds: ['ann green'],
        rounds: [
          ...simpleSeason('Ann Green', 'Bob Blue'),
          round('Ann Green', {
            sequence: 5,
            eventId: 'champ',
            eventLabel: '#97',
            eventType: 'championship',
            place: 1,
            eventPoints: 0,
          }),
        ],
      }),
    );
    expect(view.summary).not.toContain('#97');
    expect(view.summary).toContain('Ann Green won the Championship, and with it');
  });
});

describe('the chase', () => {
  /**
   * Ann wins, but Bob leads in the middle and going into the last event.
   *
   * Running totals, lower being better: Ann 0, 3, 3, 3 -- Bob 2, 2, 2, 4.
   * So Ann leads after one, Bob takes it at two and holds it through three,
   * and Ann wins the last event to take the season by a point.
   */
  function seasonWithLeadChanges(): RecapRound[] {
    const pts: Record<string, number[]> = {
      // event:            1    2    3    4
      'Ann Green': /*  */ [0, 3, 0, 0],
      'Bob Blue': /*   */ [2, 0, 0, 2],
    };
    return [1, 2, 3, 4].flatMap((seq) =>
      Object.entries(pts).map(([name, list]) =>
        round(name, {
          sequence: seq,
          eventId: `e${seq}`,
          eventPoints: list[seq - 1],
          place: list[seq - 1] === 0 ? 1 : 4,
          netScore: list[seq - 1] === 0 ? -3 : 2,
          eventLabel: `Course ${seq}`,
        }),
      ),
    );
  }

  it('gives the player who led and lost it a paragraph of their own', () => {
    const view = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 3, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
        ],
        rounds: seasonWithLeadChanges(),
      }),
    );
    const chase = view.paragraphs.find((p) => p.startsWith('Bob'));
    expect(chase).toBeDefined();
    expect(chase).toContain('led going into the last event that paid points');
    expect(chase).toContain('one point in front');
    expect(chase).toContain('that was the season');
  });

  it('counts taking the lead, not the events spent leading', () => {
    // Bob leads events two and three. That is taking the lead once, and
    // calling it twice would invent a swing that never happened.
    const view = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 3, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
        ],
        rounds: seasonWithLeadChanges(),
      }),
    );
    expect(view.summary).not.toContain('took the lead two times');
    expect(view.summary).not.toContain('three times');
  });

  it('counts the lead changing hands', () => {
    const view = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 3, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
        ],
        rounds: seasonWithLeadChanges(),
      }),
    );
    // Ann leads, Bob takes it, Ann takes it back: two changes. English
    // stops counting at two, so it reads "twice" rather than "two times".
    expect(view.paragraphs[0]).toContain('the lead changed hands twice');
  });

  it('never lets the Championship look like it decided the points race', () => {
    // The Championship pays zero season points, so it cannot change the
    // standings -- a recap that treated it as the decider would be inventing
    // drama the rules forbid.
    const withChampionship = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 3, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
        ],
        rounds: [
          ...seasonWithLeadChanges(),
          round('Bob Blue', {
            sequence: 5,
            eventId: 'champ',
            eventLabel: 'Otter Creek',
            eventType: 'championship',
            place: 1,
            eventPoints: 0,
            netScore: -4,
          }),
        ],
        championIds: ['bob blue'],
      }),
    );
    // The run-in is the last *scoring* event, never Otter Creek.
    expect(withChampionship.summary).not.toContain('went into Otter Creek in front');
  });

  it('tells the playoff, which the scores alone cannot', () => {
    const view = seasonRecapView(
      input({
        championIds: ['ann green'],
        playoffLoserIds: ['bob blue'],
        rounds: [
          ...simpleSeason('Ann Green', 'Bob Blue'),
          round('Ann Green', {
            sequence: 5,
            eventId: 'champ',
            eventType: 'championship',
            place: 1,
            eventPoints: 0,
            netScore: -1,
          }),
          round('Bob Blue', {
            sequence: 5,
            eventId: 'champ',
            eventType: 'championship',
            place: 1,
            eventPoints: 0,
            netScore: -1,
          }),
        ],
      }),
    );
    expect(view.summary).toContain('losing the playoff');
    expect(view.summary).toContain('Bob Blue');
  });
});

describe('career context', () => {
  it('calls out a first title, once it knows the history', () => {
    const view = seasonRecapView(
      input({
        history: [
          {
            playerId: 'ann green',
            priorTitleYears: [],
            careerWins: 6,
            priorSeasons: 3,
          },
        ],
      }),
    );
    expect(view.paragraphs[0]).toContain('a first season title in four years');
  });

  it('says back-to-back when last year was theirs', () => {
    const view = seasonRecapView(
      input({
        history: [
          {
            playerId: 'ann green',
            priorTitleYears: [2025],
            careerWins: 8,
            priorSeasons: 4,
          },
        ],
      }),
    );
    expect(view.paragraphs[0]).toContain('back-to-back');
  });

  it('dates the previous title when it was not last year', () => {
    const view = seasonRecapView(
      input({
        history: [
          {
            playerId: 'ann green',
            priorTitleYears: [2021],
            careerWins: 8,
            priorSeasons: 6,
          },
        ],
      }),
    );
    expect(view.paragraphs[0]).toContain(
      'second season title, and the first since 2021',
    );
  });

  it('notes when most of a career happened this year', () => {
    const view = seasonRecapView(
      input({
        history: [
          {
            playerId: 'ann green',
            priorTitleYears: [],
            careerWins: 6,
            priorSeasons: 3,
          },
        ],
      }),
    );
    // Four wins this season out of six career wins.
    expect(view.paragraphs[0]).toContain(
      "four of Green's six career wins came this year",
    );
  });

  it('stays silent about a career it was told nothing about', () => {
    const view = seasonRecapView(input());
    expect(view.paragraphs[0]).not.toContain('career');
    expect(view.paragraphs[0]).not.toContain('first season title');
  });
});

describe('footnotes', () => {
  it('tells the story of the ball-striker who got nothing for it', () => {
    const view = seasonRecapView(
      input({
        standings: [
          standing('Ann Green', 0, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
          standing('Cal Grey', 9, { seasonRank: 3, eventsPlayed: 4 }),
        ],
        rounds: [
          ...simpleSeason('Ann Green', 'Bob Blue'),
          ...[1, 2, 3, 4].map((seq) =>
            round('Cal Grey', {
              sequence: seq,
              eventId: `e${seq}`,
              // Lowest gross in the league, but the handicap gives it back.
              trueScore: seq === 2 ? -2 : 1,
              netScore: 3,
              place: 3,
              eventPoints: 1.5,
              eventLabel: 'Beaver Creek',
            }),
          ),
        ],
      }),
    );
    const note = view.paragraphs[view.paragraphs.length - 1];
    expect(note).toContain('Cal Grey');
    expect(note).toContain('best golf in the chapter');
    expect(note).toContain('two under');
    expect(note).toContain('no wins');
  });

  it('follows up on last year&apos;s winner when the year went badly', () => {
    const view = seasonRecapView(
      input({
        previousChampionId: 'cal grey',
        standings: [
          standing('Ann Green', 0, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
          standing('Cal Grey', 20, { seasonRank: 5, eventsPlayed: 2 }),
        ],
      }),
    );
    expect(view.summary).toContain('Cal Grey, who won the 2025 season');
    expect(view.summary).toContain('two events');
    expect(view.summary).toContain('fifth');
  });

  it('says nothing about last year&apos;s winner when they went well again', () => {
    const view = seasonRecapView(
      input({
        previousChampionId: 'bob blue',
        standings: [
          standing('Ann Green', 0, { seasonRank: 1 }),
          standing('Bob Blue', 4, { seasonRank: 2 }),
        ],
      }),
    );
    expect(view.summary).not.toContain('who won the 2025 season');
  });
});
