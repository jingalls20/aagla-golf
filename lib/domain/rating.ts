import type { EventType } from './types';

/**
 * An experimental cross-chapter rating, in the spirit of a world ranking.
 *
 * Every event is already a small round robin: eleven players on a card is
 * fifty-five head-to-head results. Those pairings are what this rates, using
 * Glicko -- Elo with an explicit uncertainty attached -- run season by
 * season over a rolling window.
 *
 * Four decisions are worth stating plainly, because each is arguable.
 *
 * **Gross, not net.** The handicap is built to drag everyone back toward
 * even: play better and next season's figure tightens until you are around
 * par again. A rating built on net scores would therefore measure who is
 * currently beating their own handicap, and would keep pulling the whole
 * field to the middle by design. Raw strokes against par is the number that
 * tracks whether somebody is actually getting better.
 *
 * **Head to head, not finishing position.** Beating nine players says more
 * than beating two, and it says more still when the nine are good. Rating
 * the pairings gets field strength for nothing: no separate model, no
 * circularity, and a three-player card in 2015 counts for about as little
 * as it should.
 *
 * **Uncertainty is carried, not hidden.** The two chapters are joined by
 * five people who have played both, and only one of them substantially. A
 * rating that placed a Seattle player third without saying how thin that
 * evidence is would be overclaiming, so every rating carries a deviation
 * and anyone short of `MIN_ROUNDS` is marked provisional rather than ranked.
 *
 * That last one is why the pairings inside an event are damped rather than
 * counted at face value (see `updatePlayer`). Ten pairings from a single
 * round are ten views of one round, not ten rounds -- taken as ten, every
 * deviation collapses to its floor inside half a season and the figure stops
 * telling anyone anything.
 *
 * **Rolling, not all-time.** Only the last `WINDOW_SEASONS` seasons feed it,
 * so this answers "who is playing best now" rather than "who has the best
 * career" -- the record book already answers the latter.
 *
 * Pure, like the rest of this directory. No client, no clock, no fetch.
 */

/** Seasons in the window. Three gives roughly twenty events to rate on. */
export const WINDOW_SEASONS = 3;

/** Rounds inside the window before a player is ranked rather than provisional. */
export const MIN_ROUNDS = 8;

/** Everyone starts here, knowing nothing about them. */
const START_RATING = 1500;
const START_DEVIATION = 350;

/** Floor on deviation: nobody is ever perfectly known in a league this size. */
export const MIN_DEVIATION = 60;

/** How much a season of not playing widens a rating. */
const INACTIVITY_PER_SEASON = 70;

/**
 * What a result is worth. A Championship moves a rating close to twice as
 * far as an ordinary Sunday, which is the "high stakes" weighting -- applied
 * to the weight of the comparison rather than to the points, so it changes
 * confidence as well as direction.
 */
const STAKES: Record<EventType, number> = {
  event: 1,
  major: 1.4,
  championship: 1.8,
};

/** How much a season fades per year of age inside the window. */
const RECENCY_DECAY = 0.65;

const Q = Math.log(10) / 400;

export interface RatingRound {
  playerId: string;
  /** Identity across chapters, since a person may hold two roster rows. */
  personKey: string;
  name: string;
  photoUrl: string | null;
  chapterLabel: string;
  leagueSlug: string;
  year: number;
  eventId: string;
  eventType: EventType;
  /** Strokes against par, before handicap. Null means they did not play. */
  grossScore: number | null;
}

export interface RatingRow {
  personKey: string;
  name: string;
  photoUrl: string | null;
  /** Where to link them, and what to label them with. */
  chapters: { label: string; leagueSlug: string; playerId: string }[];
  rating: number;
  deviation: number;
  rounds: number;
  /** Rank among the ranked. Provisional players carry null. */
  rank: number | null;
  provisional: boolean;
  /** Rating a season ago, for the movement column. Null when they had none. */
  previousRating: number | null;
}

interface Player {
  rating: number;
  deviation: number;
}

function g(deviation: number): number {
  return 1 / Math.sqrt(1 + (3 * Q * Q * deviation * deviation) / (Math.PI * Math.PI));
}

function expected(rating: number, other: Player): number {
  return 1 / (1 + Math.pow(10, (-g(other.deviation) * (rating - other.rating)) / 400));
}

/** One pairing: who, against whom, worth how much, scored how. */
interface Comparison {
  opponent: Player;
  /** 1 win, 0 loss, 0.5 tie. */
  score: number;
  weight: number;
}

/**
 * One Glicko rating period, with weighted comparisons.
 *
 * Standard Glicko has no notion of one game mattering more than another, so
 * the weight multiplies each comparison's contribution to both the shift and
 * the confidence gained. A Championship therefore moves a rating further
 * *and* tightens it more, which is what "high stakes" ought to mean.
 *
 * The weights arriving here are already damped by the square root of the
 * field, which is the one piece of statistics in this file worth spelling
 * out. Glicko assumes its games are independent; the pairings within one
 * round emphatically are not, since they are a single score compared
 * against everyone else's. Counted as independent, a twelve-player card
 * supplied eleven games' worth of certainty, every deviation hit the floor
 * within half a season, and somebody with six rounds behind them read as
 * exactly as settled as somebody with twenty.
 *
 * Dividing the field out entirely overcorrects the other way: it makes a
 * twelve-player card worth precisely what a two-player one is, when it
 * plainly tells you more about where a player stands. The square root is
 * the usual compromise for observations that are correlated but not
 * identical -- a crowded card still counts for more, just nowhere near
 * eleven times more.
 */
function updatePlayer(player: Player, comparisons: Comparison[]): Player {
  if (comparisons.length === 0) return player;

  let infoSum = 0;
  let deltaSum = 0;
  for (const c of comparisons) {
    const e = expected(player.rating, c.opponent);
    const gj = g(c.opponent.deviation);
    infoSum += c.weight * gj * gj * e * (1 - e);
    deltaSum += c.weight * gj * (c.score - e);
  }
  if (infoSum <= 0) return player;

  const dSquared = 1 / (Q * Q * infoSum);
  const denominator = 1 / (player.deviation * player.deviation) + 1 / dSquared;

  return {
    rating: player.rating + (Q / denominator) * deltaSum,
    deviation: Math.max(MIN_DEVIATION, Math.sqrt(1 / denominator)),
  };
}

function widenForInactivity(player: Player): Player {
  return {
    rating: player.rating,
    deviation: Math.min(
      START_DEVIATION,
      Math.sqrt(
        player.deviation * player.deviation +
          INACTIVITY_PER_SEASON * INACTIVITY_PER_SEASON,
      ),
    ),
  };
}

/**
 * Rate everyone over the rolling window.
 *
 * Seasons are the rating periods, oldest first, so a player's standing
 * enters each season as what the previous ones made of them.
 */
export function buildRatings(rounds: RatingRound[]): RatingRow[] {
  const played = rounds.filter((r) => r.grossScore !== null);
  if (played.length === 0) return [];

  const years = [...new Set(played.map((r) => r.year))].sort((a, b) => a - b);
  const window = years.slice(-WINDOW_SEASONS);
  const inWindow = played.filter((r) => window.includes(r.year));
  const newest = window[window.length - 1];

  const players = new Map<string, Player>();
  const ratingBefore = new Map<string, number>();
  const meta = new Map<string, RatingRound[]>();

  for (const r of inWindow) {
    meta.set(r.personKey, [...(meta.get(r.personKey) ?? []), r]);
  }

  for (const year of window) {
    const seasonRounds = inWindow.filter((r) => r.year === year);
    const age = newest - year;
    const recency = Math.pow(RECENCY_DECAY, age);

    // Snapshot before the newest season, so movement has something to
    // compare against.
    if (year === newest) {
      for (const [key, p] of players) ratingBefore.set(key, p.rating);
    }

    const seen = new Set(seasonRounds.map((r) => r.personKey));
    for (const [key, p] of players) {
      if (!seen.has(key)) players.set(key, widenForInactivity(p));
    }

    // Every event in the season is a round robin among whoever posted.
    const byEvent = new Map<string, RatingRound[]>();
    for (const r of seasonRounds) {
      byEvent.set(r.eventId, [...(byEvent.get(r.eventId) ?? []), r]);
    }

    const pending = new Map<string, Comparison[]>();
    for (const [, field] of byEvent) {
      if (field.length < 2) continue;
      // Damped by the square root of the pairings each player gets out of
      // this event, so a crowded card is worth more than a sparse one but
      // nothing like the whole field. See `updatePlayer`.
      const weight =
        (recency * (STAKES[field[0].eventType] ?? 1)) / Math.sqrt(field.length - 1);

      for (const a of field) {
        for (const b of field) {
          if (a.personKey === b.personKey) continue;
          const opponent = players.get(b.personKey) ?? {
            rating: START_RATING,
            deviation: START_DEVIATION,
          };
          const score =
            (a.grossScore as number) < (b.grossScore as number)
              ? 1
              : (a.grossScore as number) > (b.grossScore as number)
                ? 0
                : 0.5;
          pending.set(a.personKey, [
            ...(pending.get(a.personKey) ?? []),
            { opponent, score, weight },
          ]);
        }
      }
    }

    // Applied together, so everyone in a season is rated against the field
    // as it stood at the start of it rather than against a moving target.
    for (const [key, comparisons] of pending) {
      const current = players.get(key) ?? {
        rating: START_RATING,
        deviation: START_DEVIATION,
      };
      players.set(key, updatePlayer(current, comparisons));
    }
  }

  const rows: RatingRow[] = [];
  for (const [key, p] of players) {
    const theirs = meta.get(key) ?? [];
    if (theirs.length === 0) continue;

    const chapters = [...new Map(theirs.map((r) => [r.leagueSlug, r])).values()].map(
      (r) => ({
        label: r.chapterLabel,
        leagueSlug: r.leagueSlug,
        playerId: r.playerId,
      }),
    );

    rows.push({
      personKey: key,
      name: theirs[0].name,
      photoUrl: theirs.find((r) => r.photoUrl)?.photoUrl ?? null,
      chapters,
      rating: Math.round(p.rating),
      deviation: Math.round(p.deviation),
      rounds: theirs.length,
      rank: null,
      provisional: theirs.length < MIN_ROUNDS,
      previousRating: ratingBefore.has(key)
        ? Math.round(ratingBefore.get(key) as number)
        : null,
    });
  }

  rows.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));

  let rank = 0;
  for (const row of rows) {
    if (!row.provisional) row.rank = ++rank;
  }

  return rows;
}
