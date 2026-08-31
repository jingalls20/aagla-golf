import { round2 } from './standings';

/**
 * The Hall of Champions: one entry per season, built from that season's own
 * numbers.
 *
 * The champion is whoever won the Championship -- the event that closes the
 * year -- rather than whoever topped the points table. In this league those
 * are usually different people (in Iowa, nine years out of thirteen), and
 * the trophy is the one this page is named after.
 *
 * The blurb is generated, not written, for the same reason the player-page
 * write-up and the Discord recaps are: it appears beside a photograph of a
 * real person and must be incapable of inventing a season that did not
 * happen. Every clause is a claim about a figure passed in, and a clause
 * whose data is missing is dropped rather than softened.
 *
 * Pure: no client, no clock. Feed it seasons and read the prose back.
 */

export interface HallPlayer {
  playerId: string;
  name: string;
  photoUrl: string | null;
  /** Their Championship score, net of the staggered start. */
  netScore: number | null;
  /** Where they finished the season on points, when that is known. */
  seasonRank: number | null;
}

/** One season's Championship, as it was actually played. */
export interface HallSeasonInput {
  year: number;
  /** Where it was played, or what it was called. */
  where: string | null;
  /** Everyone who tied for the win. More than one is a shared title. */
  champions: HallPlayer[];
  /** The best score behind the winners, for the margin. */
  runnerUp: { name: string; netScore: number | null } | null;
  /** How many players posted a score that day. */
  fieldSize: number;
  /** Who topped the season's points table, by id. */
  pointsWinners: { playerId: string; name: string }[];
}

export interface HallEntry extends HallSeasonInput {
  /** True when the title was shared. */
  shared: boolean;
  /** Which Championship this was for the winner: 1 for their first. Shared
   *  titles carry one count per holder, in the same order as `champions`. */
  titleNumbers: number[];
  blurb: string;
}

const ORDINAL_WORDS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

/** "third" up to tenth, then "11th" -- prose for the numbers that come up. */
function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? ordinal(n);
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : n % 10 === 1
        ? 'st'
        : n % 10 === 2
          ? 'nd'
          : n % 10 === 3
            ? 'rd'
            : 'th';
  return `${n}${suffix}`;
}

const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function count(n: number, noun: string): string {
  const word = n < WORDS.length ? WORDS[n] : String(n);
  return `${word} ${noun}${n === 1 ? '' : 's'}`;
}

function names(list: { name: string }[]): string {
  const n = list.map((x) => x.name);
  if (n.length <= 1) return n[0] ?? '';
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/**
 * Build the hall, oldest season first internally so a title can be counted
 * against the ones before it, then handed back newest first -- which is the
 * order the page reads in.
 */
export function buildHall(seasons: HallSeasonInput[]): HallEntry[] {
  const chronological = [...seasons].sort((a, b) => a.year - b.year);

  /** Years each player has already won, as the walk goes forward. */
  const wonBefore = new Map<string, number[]>();
  const entries: HallEntry[] = [];

  for (const season of chronological) {
    const titleNumbers = season.champions.map(
      (c) => (wonBefore.get(c.playerId)?.length ?? 0) + 1,
    );
    const previous = season.champions.map(
      (c) => wonBefore.get(c.playerId)?.slice(-1)[0] ?? null,
    );

    entries.push({
      ...season,
      shared: season.champions.length > 1,
      titleNumbers,
      blurb: blurbFor(season, titleNumbers, previous, entries.length === 0),
    });

    for (const c of season.champions) {
      wonBefore.set(c.playerId, [...(wonBefore.get(c.playerId) ?? []), season.year]);
    }
  }

  return entries.reverse();
}

/**
 * A season in a couple of sentences.
 *
 * Written as a list of independent claims, each skipped when its data is
 * missing, so a thin season reads short rather than reading wrong.
 */
function blurbFor(
  season: HallSeasonInput,
  titleNumbers: number[],
  previousWins: (number | null)[],
  isEarliest: boolean,
): string {
  if (season.champions.length === 0) return '';

  const sentences: string[] = [];

  // Who won, and what number it was for them.
  const opening: string[] = [];
  if (season.champions.length > 1) {
    opening.push(`${names(season.champions)} shared the title`);
  } else {
    const n = titleNumbers[0];
    const previous = previousWins[0];
    const who = season.champions[0].name;
    if (n === 1) {
      opening.push(`${who}'s first Championship`);
    } else if (previous === season.year - 1) {
      opening.push(`${who} went back to back for a ${ordinalWord(n)} title`);
    } else if (previous !== null) {
      opening.push(
        `${who}'s ${ordinalWord(n)} Championship, and the first since ${previous}`,
      );
    } else {
      opening.push(`${who}'s ${ordinalWord(n)} Championship`);
    }
  }

  // The margin, and only where the figures actually support one.
  //
  // Championships imported from the old spreadsheet carry the places that
  // sheet recorded, and those do not always follow the net scores stored
  // beside them -- 2019 has a player on -7 sitting second behind a -5.
  // Whatever the sheet ranked on cannot be reconstructed here, so a margin
  // is stated only where the winner's score really is the better one.
  // Anywhere else the clause is dropped rather than guessed at: a line
  // printed beside somebody's photograph is no place to invent a scoreline.
  const winning = season.champions[0].netScore;
  const chasing = season.runnerUp?.netScore ?? null;
  if (winning !== null && chasing !== null && season.runnerUp) {
    const margin = round2(chasing - winning);
    if (margin > 0) {
      opening.push(`${count(margin, 'stroke')} clear of ${season.runnerUp.name}`);
    }
  }
  sentences.push(`${opening.join(', ')}.`);

  // What surrounded the day: the size of the field, and who the season
  // itself belonged to -- which in this league is usually somebody else.
  const context: string[] = [];
  if (season.fieldSize > 0) context.push(`A field of ${word(season.fieldSize)}`);

  const doubled = season.champions.filter((c) =>
    season.pointsWinners.some((w) => w.playerId === c.playerId),
  );
  const rank = season.champions[0].seasonRank;

  if (doubled.length > 0) {
    context.push(
      `and the double: ${names(doubled)} had already taken the season points`,
    );
  } else if (season.pointsWinners.length > 0) {
    const also =
      season.champions.length === 1 && rank !== null && rank > 1
        ? `, with the champion ${ordinalWord(rank)} on the year`
        : '';
    context.push(`${names(season.pointsWinners)} took the season points${also}`);
  }

  if (context.length > 0) sentences.push(`${context.join(' — ')}.`);
  if (isEarliest) sentences.push('The earliest Championship on record.');

  return sentences.join(' ');
}

/** Small numbers read better as words. */
function word(n: number): string {
  return n < WORDS.length ? WORDS[n] : String(n);
}
