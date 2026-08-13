import { isPlayed } from './career';
import type { EventType } from './types';

/**
 * Event and season recaps, written from the numbers.
 *
 * Generated rather than model-written, for the same reason the player-page
 * write-up is: a recap that posts itself to a public channel has to be
 * incapable of inventing a result. Every sentence here is a claim about a
 * figure that was passed in, and a claim whose data is missing is dropped
 * rather than softened. Nothing reaches Discord that the scores don't say.
 *
 * The output is Discord-flavoured Markdown, which is a subset of the usual
 * one: `**bold**`, `_italic_`, `>` quotes and bare newlines all work, but
 * tables and headings do not, so the shape has to come from line breaks and
 * emphasis alone.
 *
 * Pure, like the rest of this directory -- no client, no clock, no fetch.
 * Feeding it a fixture and reading the paragraph back is the whole test.
 */

export interface RecapRound {
  playerName: string;
  trueScore: number | null;
  netScore: number | null;
  place: number | null;
  eventPoints: number | null;
  /** Handicap strokes the player was given for this round. */
  fsApplied: number | null;
}

export interface EventRecapInput {
  leagueName: string;
  year: number;
  eventType: EventType;
  /** What the day was called, when it was called anything. */
  eventName: string | null;
  /** Where it was played, when that was recorded. */
  course: string | null;
  /** Position within the season, used when there is no name. */
  sequence: number;
  rounds: RecapRound[];
}

export interface SeasonRecapInput {
  leagueName: string;
  year: number;
  /** Standings order, best first. */
  standings: {
    playerName: string;
    totalPoints: number;
    eventsPlayed: number;
    seasonRank: number;
  }[];
  eventsPlayed: number;
  eventsScheduled: number;
  /** Who won the Championship, once it has been played. */
  championName: string | null;
  /** Every round of the season, for the superlatives. */
  rounds: (RecapRound & { eventLabel: string })[];
}

/** Scores read the golfer's way: under par is the good end. */
export function toPar(n: number): string {
  if (n === 0) return 'even';
  return n > 0 ? `+${n}` : String(n);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * How to refer to the event in a sentence.
 *
 * Course and name are different things and only coincide by accident, so
 * both are used when both exist and differ -- "Toad Valley" alone loses the
 * fact that it was the Ryder Cup, and vice versa.
 */
export function eventLabel(e: {
  eventName: string | null;
  course: string | null;
  sequence: number;
  eventType: EventType;
}): string {
  const name = e.eventName?.trim() || null;
  const course = e.course?.trim() || null;

  if (name && course && name !== course) return `${name} at ${course}`;
  if (name) return name;
  if (course) return course;
  if (e.eventType === 'championship') return 'the Championship';
  if (e.eventType === 'major') return `Major #${e.sequence}`;
  return `Event #${e.sequence}`;
}

/** Everyone on the winning score. A tie is two winners, not a coin toss. */
function winnersOf(rounds: RecapRound[]): RecapRound[] {
  return rounds.filter((r) => r.place === 1);
}

function names(rounds: { playerName: string }[]): string {
  const list = rounds.map((r) => r.playerName);
  if (list.length <= 1) return list[0] ?? '';
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/**
 * The recap for a single event.
 *
 * Returns null when there is nothing to say -- an event with no played
 * rounds has no story, and posting "nobody played" to a channel is worse
 * than posting nothing.
 */
export function eventRecap(input: EventRecapInput): string | null {
  const played = input.rounds.filter((r) => isPlayed({ trueScore: r.trueScore }));
  if (played.length === 0) return null;

  const label = eventLabel(input);
  const kind =
    input.eventType === 'championship'
      ? 'Championship'
      : input.eventType === 'major'
        ? 'Major'
        : 'event';

  const lines: string[] = [];
  lines.push(`**${input.leagueName} — ${label}**`);
  lines.push(
    `${input.year} ${kind} · ${plural(played.length, 'player')} posted a score.`,
  );
  lines.push('');

  const winners = winnersOf(played);
  if (winners.length > 0) {
    const net = winners[0].netScore;
    const score = net === null ? '' : ` on ${toPar(net)} net`;
    lines.push(
      winners.length === 1
        ? `🏆 **${winners[0].playerName}** takes it${score}.`
        : `🏆 **${names(winners)}** share it${score}.`,
    );
  }

  // The leaderboard, as far down as is worth reading out.
  const board = [...played]
    .filter((r) => r.place !== null)
    .sort((a, b) => (a.place as number) - (b.place as number))
    .slice(0, LEADERBOARD_LINES);
  if (board.length > 0) {
    lines.push('');
    for (const r of board) {
      const net = r.netScore === null ? '—' : toPar(r.netScore);
      const gross = r.trueScore === null ? '—' : toPar(r.trueScore);
      const pts = r.eventPoints === null ? '' : ` · ${plural(r.eventPoints, 'point')}`;
      lines.push(
        `${medal(r.place as number)} ${r.playerName} — ${net} net (${gross} gross)${pts}`,
      );
    }
  }

  // The best raw round of the day, when handicaps mean it wasn't the winner.
  // Worth its own line precisely because the winner's board hides it.
  const bestGross = lowestBy(played, (r) => r.trueScore);
  if (bestGross && !winners.some((w) => w.playerName === bestGross.playerName)) {
    lines.push('');
    lines.push(
      `Low gross: **${bestGross.playerName}** at ${toPar(bestGross.trueScore as number)}.`,
    );
  }

  return lines.join('\n');
}

/** How many places to read out before it stops being interesting. */
const LEADERBOARD_LINES = 5;

function medal(place: number): string {
  if (place === 1) return '🥇';
  if (place === 2) return '🥈';
  if (place === 3) return '🥉';
  return `${place}.`;
}

function lowestBy(
  rounds: RecapRound[],
  pick: (r: RecapRound) => number | null,
): RecapRound | null {
  let best: RecapRound | null = null;
  for (const r of rounds) {
    const v = pick(r);
    if (v === null) continue;
    const bv = best === null ? null : pick(best);
    if (bv === null || v < bv) best = r;
  }
  return best;
}

/**
 * The recap for a season, whether it is finished or halfway through.
 *
 * Deliberately reads differently depending on which: a season in progress
 * gets "leads", a finished one gets "takes the season". Announcing a winner
 * before the last card is in has been the failure mode of every league
 * newsletter ever written.
 */
export function seasonRecap(input: SeasonRecapInput): string | null {
  if (input.standings.length === 0) return null;

  const done = input.eventsPlayed >= input.eventsScheduled && input.eventsPlayed > 0;
  const lines: string[] = [];

  lines.push(`**${input.leagueName} — ${input.year} season**`);
  lines.push(
    done
      ? `That's a wrap on ${input.year}: ${plural(input.eventsPlayed, 'event')} played.`
      : `${input.eventsPlayed} of ${input.eventsScheduled} events played.`,
  );
  lines.push('');

  const top = input.standings.slice(0, STANDINGS_LINES);
  const leader = top[0];
  // Points are golf-scored here: lower is better, 1st place earns 0.
  lines.push(
    done
      ? `🏆 **${leader.playerName}** takes the season on ${plural(leader.totalPoints, 'point')}.`
      : `**${leader.playerName}** leads on ${plural(leader.totalPoints, 'point')}.`,
  );

  lines.push('');
  for (const s of top) {
    lines.push(
      `${medal(s.seasonRank)} ${s.playerName} — ${plural(s.totalPoints, 'pt')} · ${plural(s.eventsPlayed, 'event')}`,
    );
  }

  if (input.championName) {
    lines.push('');
    lines.push(`Championship: **${input.championName}**.`);
  }

  const played = input.rounds.filter((r) => isPlayed({ trueScore: r.trueScore }));
  const bestNet = lowestBy(played, (r) => r.netScore) as
    (RecapRound & { eventLabel: string }) | null;
  const bestGross = lowestBy(played, (r) => r.trueScore) as
    (RecapRound & { eventLabel: string }) | null;

  const notes: string[] = [];
  if (bestNet?.netScore !== undefined && bestNet?.netScore !== null) {
    notes.push(
      `Round of the year: **${bestNet.playerName}**, ${toPar(bestNet.netScore)} net at ${bestNet.eventLabel}.`,
    );
  }
  if (
    bestGross?.trueScore !== undefined &&
    bestGross?.trueScore !== null &&
    bestGross.playerName !== bestNet?.playerName
  ) {
    notes.push(
      `Low gross: **${bestGross.playerName}**, ${toPar(bestGross.trueScore)} at ${bestGross.eventLabel}.`,
    );
  }
  if (notes.length > 0) {
    lines.push('');
    lines.push(...notes);
  }

  return lines.join('\n');
}

/** How many places of the standings to read out. */
const STANDINGS_LINES = 5;

/**
 * Discord rejects a message over 2000 characters outright, so a long season
 * has to be cut somewhere. Cutting at a line break and saying so is better
 * than a truncated sentence or a failed post.
 */
export const DISCORD_LIMIT = 2000;

export function fitToDiscord(text: string, limit = DISCORD_LIMIT): string {
  if (text.length <= limit) return text;
  const suffix = '\n…';
  const room = limit - suffix.length;
  const cut = text.slice(0, room);
  const lastBreak = cut.lastIndexOf('\n');
  return (lastBreak > 0 ? cut.slice(0, lastBreak) : cut) + suffix;
}
