import type { EventType } from './types';

/**
 * Career shaping: turning a flat list of rounds into the back of a baseball
 * card, plus the prose that goes on the front.
 *
 * Pure, like everything else in this directory. No Supabase client, no clock,
 * no randomness -- which matters more here than it looks. The summary text is
 * *generated*, not written by a language model, and the reason that's an
 * acceptable substitute is precisely that it can only ever restate numbers
 * this module was handed. It cannot invent a championship.
 *
 * Two conventions from the rest of the app carry through and are easy to get
 * backwards:
 *
 * - **Every score is relative to par.** 0 is level, positive is over.
 * - **Lower is better, including points.** 1st place scores 0 season points
 *   and the season is won by the lowest total. So "best" almost always means
 *   "smallest" in here.
 */

export interface CareerRound {
  year: number;
  eventType: EventType;
  eventName: string | null;
  sequence: number;
  trueScore: number | null;
  fsApplied: number | null;
  netScore: number | null;
  place: number | null;
  eventPoints: number | null;
}

/** One row on the back of the card. */
export interface SeasonLine {
  year: number;
  rounds: number;
  wins: number;
  podiums: number;
  /** Mean gross score to par across played rounds. */
  avgScore: number | null;
  /** Mean net score to par across played rounds. */
  avgNet: number | null;
  /** Single best (lowest) net round of the season. */
  bestNet: number | null;
  /** Season points total. Lower is better; null when nothing scored. */
  points: number | null;
  /** The handicap in force that season, if one was locked. */
  handicap: number | null;
  /** Whether they played the Championship, and whether they took it. */
  championship: 'won' | 'played' | null;
}

export interface CareerTotals {
  rounds: number;
  wins: number;
  podiums: number;
  championships: number;
  seasons: number;
  firstYear: number | null;
  lastYear: number | null;
  avgNet: number | null;
  bestNet: number | null;
}

/** A round only counts as played once a real score exists for it. A 'missed'
 *  or 'dnp' row carries a place and points but no stroke count, and averaging
 *  those in would quietly punish a player for a week they were on holiday. */
export function isPlayed(r: CareerRound): boolean {
  return r.trueScore !== null;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
}

function defined(xs: (number | null)[]): number[] {
  return xs.filter((x): x is number => x !== null);
}

/**
 * Per-season stat lines, oldest first.
 *
 * `handicaps` is keyed by year rather than merged into the rounds because a
 * handicap belongs to a season, not to a round -- a player who sat out a year
 * still has one on record.
 */
export function seasonLines(
  rounds: CareerRound[],
  handicaps: { year: number; fs: number }[] = [],
): SeasonLine[] {
  const handicapByYear = new Map(handicaps.map((h) => [h.year, h.fs]));
  const years = new Set<number>([
    ...rounds.map((r) => r.year),
    ...handicaps.map((h) => h.year),
  ]);

  return [...years]
    .sort((a, b) => a - b)
    .map((year) => {
      const inYear = rounds.filter((r) => r.year === year);
      const played = inYear.filter(isPlayed);
      const champ = inYear.find((r) => r.eventType === 'championship');
      const nets = defined(played.map((r) => r.netScore));
      // Points accrue on every row including 'missed' and 'dnp', because
      // taking last place still costs you. That's the season standings rule,
      // so it has to be the season line rule too.
      const pts = defined(inYear.map((r) => r.eventPoints));

      return {
        year,
        rounds: played.length,
        wins: played.filter((r) => r.place === 1).length,
        podiums: played.filter((r) => r.place !== null && r.place <= 3).length,
        avgScore: mean(defined(played.map((r) => r.trueScore))),
        avgNet: mean(nets),
        bestNet: nets.length ? Math.min(...nets) : null,
        points: pts.length ? pts.reduce((a, b) => a + b, 0) : null,
        handicap: handicapByYear.get(year) ?? null,
        championship: champ
          ? champ.place === 1
            ? 'won'
            : isPlayed(champ)
              ? 'played'
              : null
          : null,
      };
    });
}

export function careerTotals(rounds: CareerRound[]): CareerTotals {
  const played = rounds.filter(isPlayed);
  const nets = defined(played.map((r) => r.netScore));
  const years = [...new Set(played.map((r) => r.year))].sort((a, b) => a - b);

  return {
    rounds: played.length,
    wins: played.filter((r) => r.place === 1).length,
    podiums: played.filter((r) => r.place !== null && r.place <= 3).length,
    championships: played.filter((r) => r.eventType === 'championship' && r.place === 1)
      .length,
    seasons: years.length,
    firstYear: years[0] ?? null,
    lastYear: years[years.length - 1] ?? null,
    avgNet: mean(nets),
    bestNet: nets.length ? Math.min(...nets) : null,
  };
}

/** Scores read relative to par everywhere in this app; say it in words. */
export function toParWords(value: number): string {
  const v = Math.round(value * 10) / 10;
  if (v === 0) return 'level par';
  if (v > 0) return `${v} over par`;
  return `${Math.abs(v)} under par`;
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

export interface SummaryChapter {
  /** Display name, e.g. "Iowa". */
  label: string;
  lines: SeasonLine[];
  rounds: CareerRound[];
}

export interface CareerSummaryInput {
  name: string;
  /** Every chapter the player has appeared in, home chapter first. */
  chapters: SummaryChapter[];
  /** Latest season present in the league, so "still active" can be judged
   *  without consulting a clock. */
  currentYear: number | null;
}

/**
 * A scouting report assembled from the player's own numbers.
 *
 * Written as a sequence of independent claims, each of which is skipped when
 * the data doesn't support it, so a player with two rounds gets two honest
 * sentences rather than a paragraph of hedging. Every figure quoted here comes
 * from the chapters handed in; nothing is inferred.
 *
 * Counting claims (rounds, wins, championships) pool across chapters. Rate
 * claims -- peak scoring season, handicap trajectory -- deliberately do not:
 * they are resolved *within* a chapter and then labelled with it. Averaging a
 * handicap earned in Iowa against one earned in Seattle would produce a number
 * that describes nobody, and silently picking one of two same-year handicaps
 * would be worse still.
 */
export function careerSummary(input: CareerSummaryInput): string {
  const { name, chapters, currentYear } = input;
  const allRounds = chapters.flatMap((c) => c.rounds);
  const totals = careerTotals(allRounds);
  const first = name.trim().split(/\s+/)[0] || name;
  const multi = chapters.length > 1;

  if (totals.rounds === 0) {
    return `${name} is on the roster but hasn't posted a score yet.`;
  }

  const sentences: string[] = [];

  // 1. Who and how long.
  const span =
    totals.firstYear && totals.lastYear && totals.firstYear !== totals.lastYear
      ? ` between ${totals.firstYear} and ${totals.lastYear}`
      : totals.firstYear
        ? ` in ${totals.firstYear}`
        : '';
  const where = multi ? ` across ${listWords(chapters.map((c) => c.label))}` : '';
  sentences.push(
    `${name} has played ${plural(totals.rounds, 'round')} over ` +
      `${plural(totals.seasons, 'season')}${span}${where}.`,
  );

  // 2. Silverware, only when there is some.
  const honours: string[] = [];
  if (totals.championships > 0) {
    const champYears = chapters
      .flatMap((c) => c.lines)
      .filter((l) => l.championship === 'won')
      .map((l) => l.year)
      .sort((a, b) => a - b);
    honours.push(
      `${plural(totals.championships, 'Championship')}` +
        (champYears.length ? ` (${[...new Set(champYears)].join(', ')})` : ''),
    );
  }
  if (totals.wins > 0) honours.push(`${plural(totals.wins, 'event win')}`);
  if (honours.length > 0) {
    sentences.push(`The cabinet holds ${listWords(honours)}.`);
  } else if (totals.podiums > 0) {
    sentences.push(
      `No wins yet, but ${plural(totals.podiums, 'top-three finish', 'top-three finishes')}.`,
    );
  }

  // 3. Peak season, resolved inside a chapter and judged on scoring rather
  //    than points -- points totals depend on how many events a season
  //    happened to run, so comparing them across years rewards long seasons.
  const rated = chapters.flatMap((c) =>
    c.lines
      .filter((l) => l.rounds >= 2 && l.avgNet !== null)
      .map((l) => ({ line: l, chapter: c.label })),
  );
  if (rated.length >= 2) {
    const best = rated.reduce((a, b) =>
      (b.line.avgNet as number) < (a.line.avgNet as number) ? b : a,
    );
    const inChapter = multi ? ` in ${best.chapter}` : '';
    sentences.push(
      `${first}'s sharpest season was ${best.line.year}${inChapter}, averaging ` +
        `${toParWords(best.line.avgNet as number)} across ` +
        `${plural(best.line.rounds, 'round')}.`,
    );
  }

  // 4. Handicap direction, read from the chapter they've played most. A
  //    falling handicap is the league's own measure of a player getting
  //    better, so it's worth more than a scoring trend.
  const busiest = [...chapters].sort(
    (a, b) => b.rounds.filter(isPlayed).length - a.rounds.filter(isPlayed).length,
  )[0];
  const withHandicap = busiest ? busiest.lines.filter((s) => s.handicap !== null) : [];
  if (withHandicap.length >= 2) {
    const from = withHandicap[0];
    const to = withHandicap[withHandicap.length - 1];
    const delta = (from.handicap as number) - (to.handicap as number);
    const where2 = multi ? ` in ${busiest.label}` : '';
    if (delta >= 2) {
      sentences.push(
        `The handicap tells the story${where2}: down from ${from.handicap} in ` +
          `${from.year} to ${to.handicap} in ${to.year}.`,
      );
    } else if (delta <= -2) {
      sentences.push(
        `The handicap has drifted the other way${where2}, from ${from.handicap} ` +
          `in ${from.year} to ${to.handicap} in ${to.year}.`,
      );
    } else {
      sentences.push(
        `Remarkably steady off ${to.handicap}${where2}, within a stroke of ` +
          `where ${first} started.`,
      );
    }
  }

  // 5. Single best round, as the highlight note.
  if (totals.bestNet !== null && totals.rounds >= 3) {
    sentences.push(`Career best round: ${toParWords(totals.bestNet)} net.`);
  }

  // 6. Whether they're still out there.
  if (
    currentYear !== null &&
    totals.lastYear !== null &&
    totals.lastYear < currentYear
  ) {
    sentences.push(`Last seen on a card in ${totals.lastYear}.`);
  }

  return sentences.join(' ');
}
