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
  /**
   * Everyone the scores show winning. More than one is a tie on the card --
   * which is not the same as a shared title, since a tie is often settled
   * by a playoff. `decidedBy` is what settles it.
   */
  champions: HallPlayer[];
  /**
   * The winner an admin named outright, where they named one.
   *
   * A playoff decides who lifts the trophy without changing a single score,
   * so a season can finish level on the card and still have one champion.
   * When this points at one of the tied players, the others are recorded as
   * having lost the playoff; when it names somebody the scores do not show
   * winning at all, it simply stands. Null means read the winner off the
   * scores, which is how most seasons work.
   */
  decidedBy?: string | null;
  /** The best score behind the winners, for the margin. */
  runnerUp: { name: string; netScore: number | null } | null;
  /** How many players posted a score that day. */
  fieldSize: number;
  /** Who topped the season's points table, by id. */
  pointsWinners: { playerId: string; name: string }[];
}

export interface HallEntry extends Omit<HallSeasonInput, 'champions'> {
  /** Who actually holds the title, after any playoff. */
  champions: HallPlayer[];
  /** True when the title really was shared -- a tie nobody played off. */
  shared: boolean;
  /** Players who tied on the card but lost the playoff. */
  playoffLosers: HallPlayer[];
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
 * Apply the named winner, where one was named.
 *
 * The scores stay exactly as they were recorded -- this decides only who is
 * shown holding the trophy. Anyone who tied on the card and is not the
 * named winner becomes a playoff loser, which is a thing worth saying out
 * loud rather than quietly dropping them from the page.
 */
function resolve(
  season: HallSeasonInput,
): HallSeasonInput & { playoffLosers: HallPlayer[] } {
  const named = season.decidedBy;
  if (!named) return { ...season, playoffLosers: [] };

  const winner = season.champions.find((c) => c.playerId === named);
  if (!winner) {
    // Named somebody the card does not show winning at all. Their word
    // stands -- that is the point of being able to set it -- but there is
    // nobody to describe as having lost a playoff to them.
    return { ...season, playoffLosers: [] };
  }

  return {
    ...season,
    champions: [winner],
    playoffLosers: season.champions.filter((c) => c.playerId !== named),
  };
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

  for (const raw of chronological) {
    const season = resolve(raw);
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
  season: HallSeasonInput & { playoffLosers: HallPlayer[] },
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

  // How a level card was settled. Worth saying plainly: the scores show a
  // tie, the page shows one champion, and without this the two look like a
  // contradiction rather than a playoff.
  if (season.playoffLosers.length > 0) {
    opening.push(`after a playoff with ${names(season.playoffLosers)}`);
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
  if (
    season.playoffLosers.length === 0 &&
    winning !== null &&
    chasing !== null &&
    season.runnerUp
  ) {
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
