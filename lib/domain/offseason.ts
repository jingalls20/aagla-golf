import type { EventType } from './types';

/**
 * What a finished season looks like when it stops being a race.
 *
 * During the season the first tab answers "where do I stand"; the moment the
 * last card is in, that question is settled and a different one takes over --
 * "what happened this year". This module produces the answer: a paragraph of
 * prose and a handful of superlatives, both assembled only from figures
 * handed in.
 *
 * Pure, like the rest of this directory, and for the same reason the career
 * summary is: the prose is *generated*, not written, and what makes that
 * acceptable is that it can only ever restate numbers this module was given.
 * It cannot invent a champion or a round that was never played.
 *
 * The league's two conventions carry through and are easy to get backwards:
 * every score is relative to par, and lower is better everywhere including
 * points, where first place scores zero.
 */

export interface RecapRound {
  playerId: string;
  playerName: string;
  eventId: string;
  eventLabel: string;
  eventType: EventType;
  /** Strokes against par before handicap. Null means they did not play. */
  trueScore: number | null;
  netScore: number | null;
  place: number | null;
}

export interface RecapStanding {
  playerId: string;
  playerName: string;
  totalPoints: number;
  eventsPlayed: number;
  seasonRank: number;
}

export interface SeasonRecapInput {
  year: number;
  /** Standings order, best first. Includes everyone, active or not. */
  standings: RecapStanding[];
  rounds: RecapRound[];
  /** Who took the Championship, by id. Usually one, occasionally a tie. */
  championIds: string[];
  /** Events with at least one score, and how many the season scheduled. */
  eventsPlayed: number;
  eventsScheduled: number;
}

/** One superlative, ready to render as a card. */
export interface Highlight {
  label: string;
  who: string;
  detail: string;
}

export interface SeasonRecapView {
  /** Everyone tied on the lowest points total. */
  pointsWinners: RecapStanding[];
  summary: string;
  highlights: Highlight[];
}

function played(rounds: RecapRound[]): RecapRound[] {
  return rounds.filter((r) => r.trueScore !== null);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function listWords(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Scores read relative to par everywhere in this app; say it in words. */
export function toParWords(value: number): string {
  const v = Math.round(value * 10) / 10;
  if (v === 0) return 'level par';
  return v > 0 ? `${v} over par` : `${Math.abs(v)} under par`;
}

/** Lowest wins, and a tie keeps everyone in it. */
function lowestBy<T>(items: T[], value: (item: T) => number | null): T[] {
  const scored = items.filter((i) => value(i) !== null);
  if (scored.length === 0) return [];
  const best = Math.min(...scored.map((i) => value(i) as number));
  return scored.filter((i) => value(i) === best);
}

/** Most wins, most rounds -- highest wins, and ties are kept. */
function highestBy<T>(items: T[], value: (item: T) => number): T[] {
  if (items.length === 0) return [];
  const best = Math.max(...items.map(value));
  if (best <= 0) return [];
  return items.filter((i) => value(i) === best);
}

/**
 * The season in a paragraph, plus its superlatives.
 *
 * Every claim is skipped rather than hedged when the data will not support
 * it, so a season with two events gets two honest sentences instead of a
 * paragraph of qualifications.
 */
export function seasonRecapView(input: SeasonRecapInput): SeasonRecapView {
  const { year, standings, rounds, championIds } = input;
  const done = played(rounds);

  const pointsWinners =
    standings.length > 0
      ? standings.filter((s) => s.totalPoints === standings[0].totalPoints)
      : [];
  const champions = standings.filter((s) => championIds.includes(s.playerId));

  const sentences: string[] = [];

  if (done.length === 0) {
    return {
      pointsWinners: [],
      summary: `No rounds were recorded in ${year}.`,
      highlights: [],
    };
  }

  // 1. The shape of the year.
  sentences.push(
    `${year} is done: ${plural(input.eventsPlayed, 'event')} played` +
      (input.eventsScheduled > input.eventsPlayed
        ? ` of ${input.eventsScheduled} scheduled.`
        : '.'),
  );

  // 2. Who took the points, and by how much. The margin is stated only when
  //    there genuinely is one -- a tie at the top is a tie, not a win.
  if (pointsWinners.length > 0) {
    const names = listWords(pointsWinners.map((w) => w.playerName));
    const runnerUp = standings.find((s) => s.totalPoints > standings[0].totalPoints);
    const margin = runnerUp
      ? Math.round((runnerUp.totalPoints - standings[0].totalPoints) * 100) / 100
      : null;
    const by =
      pointsWinners.length === 1 && margin !== null && margin > 0
        ? `, ${plural(margin, 'point')} clear of ${runnerUp?.playerName}`
        : '';
    sentences.push(
      pointsWinners.length > 1
        ? `${names} finished level on ${plural(standings[0].totalPoints, 'point')} to share the season.`
        : `${names} took the season on ${plural(standings[0].totalPoints, 'point')}${by}.`,
    );
  }

  // 3. The trophy, and whether it landed with the same person. In this
  //    league it usually does not, which is the whole reason to say so.
  if (champions.length > 0) {
    const names = listWords(champions.map((c) => c.playerName));
    const doubled = champions.every((c) =>
      pointsWinners.some((w) => w.playerId === c.playerId),
    );
    sentences.push(
      doubled
        ? `The Championship went the same way, so ${champions.length > 1 ? 'they' : 'that'} is the double.`
        : `${names} took the Championship.`,
    );
  }

  // 4. Who actually won things. The points table rewards consistency, so a
  //    player can lead a season without winning a round -- these are
  //    different questions with different answers here more often than not.
  const winners = new Map<string, number>();
  for (const r of done) {
    if (r.place === 1) winners.set(r.playerName, (winners.get(r.playerName) ?? 0) + 1);
  }
  if (winners.size > 0) {
    const spread = [...winners.entries()].sort((a, b) => b[1] - a[1]);
    // Only name somebody when they are *strictly* clear. Two players on
    // three wins each has no "most", and picking whichever sorted first
    // would be inventing one.
    const clear = spread[0][1] > 1 && (spread[1]?.[1] ?? 0) < spread[0][1];
    sentences.push(
      `${plural(spread.length, 'different winner')} across the year` +
        (clear ? `, ${spread[0][0]} taking ${spread[0][1]} of them.` : '.'),
    );
  }

  return {
    pointsWinners,
    summary: sentences.join(' '),
    highlights: highlightsOf(done),
  };
}

function highlightsOf(done: RecapRound[]): Highlight[] {
  const highlights: Highlight[] = [];

  const bestNet = lowestBy(done, (r) => r.netScore);
  if (bestNet.length > 0) {
    highlights.push({
      label: 'Round of the year',
      who: listWords([...new Set(bestNet.map((r) => r.playerName))]),
      detail: `${toParWords(bestNet[0].netScore as number)} net · ${bestNet[0].eventLabel}`,
    });
  }

  const bestGross = lowestBy(done, (r) => r.trueScore);
  if (bestGross.length > 0) {
    highlights.push({
      label: 'Low gross',
      who: listWords([...new Set(bestGross.map((r) => r.playerName))]),
      detail: `${toParWords(bestGross[0].trueScore as number)} · ${bestGross[0].eventLabel}`,
    });
  }

  // Most wins, counted over players rather than rounds so a tie reads as a
  // tie rather than as one player named twice.
  const byPlayer = new Map<string, { name: string; wins: number; rounds: number }>();
  for (const r of done) {
    const entry = byPlayer.get(r.playerId) ?? {
      name: r.playerName,
      wins: 0,
      rounds: 0,
    };
    entry.rounds += 1;
    if (r.place === 1) entry.wins += 1;
    byPlayer.set(r.playerId, entry);
  }
  const players = [...byPlayer.values()];

  const mostWins = highestBy(players, (p) => p.wins);
  if (mostWins.length > 0) {
    highlights.push({
      label: 'Most wins',
      who: listWords(mostWins.map((p) => p.name)),
      detail: plural(mostWins[0].wins, 'win'),
    });
  }

  // Only worth showing when somebody actually turned up more than somebody
  // else; a season everyone played in full says nothing here.
  const mostRounds = highestBy(players, (p) => p.rounds);
  if (mostRounds.length > 0 && mostRounds.length < players.length) {
    highlights.push({
      label: 'Most rounds',
      who: listWords(mostRounds.map((p) => p.name)),
      detail: plural(mostRounds[0].rounds, 'round'),
    });
  }

  return highlights;
}
