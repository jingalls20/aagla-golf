import type { EventType } from './types';
import {
  Subject,
  atVenue,
  count,
  listWords,
  marginOver,
  ordinalWord,
  paragraph,
  paragraphs,
  scoringLine,
  times,
  toParFigure,
  toParWords,
  word,
} from './prose';

/**
 * What a finished season looks like when it stops being a race.
 *
 * During the season the first tab answers "where do I stand"; the moment the
 * last card is in, that question is settled and a different one takes over --
 * "what happened this year". This module answers it in four beats, the shape
 * a wire report uses:
 *
 *   1. What was won, and what it means in a career.
 *   2. How it was won -- the scoring line, the shape of the year.
 *   3. The chase. Whoever led and lost it gets a real paragraph, because
 *      "led going into the last event and couldn't hold on" is a story and
 *      "finished second" is a fact.
 *   4. What else is worth remembering.
 *
 * Pure, like the rest of this directory, and the prose obeys `prose.ts`. What
 * makes generated writing acceptable here is that it can only restate figures
 * it was handed: it cannot invent a champion, a playoff, or a round nobody
 * played. Every claim is dropped rather than hedged when the data will not
 * carry it -- there is no margin over a tie, no "first title" without the
 * history to prove it, and no venue named when the event has no name.
 */

export interface RecapRound {
  playerId: string;
  playerName: string;
  eventId: string;
  /** The event's name. Null or a `#123` placeholder means it has none. */
  eventLabel: string | null;
  eventType: EventType;
  /** Where it fell in the season, for the scoring line and the run-in. */
  sequence: number;
  /** Strokes against par before handicap. Null means they did not play. */
  trueScore: number | null;
  netScore: number | null;
  place: number | null;
  /** Points this round contributed. Null for a round nobody scored. */
  eventPoints: number | null;
}

export interface RecapStanding {
  playerId: string;
  playerName: string;
  totalPoints: number;
  eventsPlayed: number;
  seasonRank: number;
}

/** What a player has done before this season, in this chapter. */
export interface RecapHistory {
  playerId: string;
  /** Seasons they have won on points before, oldest first. */
  priorTitleYears: number[];
  /** Every first place of their career, this season included. */
  careerWins: number;
  /** Seasons they have played before this one. */
  priorSeasons: number;
}

export interface SeasonRecapInput {
  year: number;
  /** Standings order, best first. Everyone, active or not. */
  standings: RecapStanding[];
  rounds: RecapRound[];
  /** Who holds the trophy, by id -- after any playoff. */
  championIds: string[];
  /** Players who tied the Championship on the card but lost the playoff. */
  playoffLoserIds?: string[];
  /** Career context, by player id. Absent means "we don't know", and every
   *  claim that needs it is skipped rather than guessed. */
  history?: RecapHistory[];
  /** Who won this chapter's points last season, for the follow-up note. */
  previousChampionId?: string | null;
  eventsPlayed: number;
  eventsScheduled: number;
}

export interface SeasonRecapView {
  /** Everyone tied on the lowest points total. */
  pointsWinners: RecapStanding[];
  /** The recap, one string per paragraph. */
  paragraphs: string[];
  /** The whole thing as one string, for places that want it flat. */
  summary: string;
}

function played(rounds: RecapRound[]): RecapRound[] {
  return rounds.filter((r) => r.trueScore !== null);
}

/** Lowest wins, and a tie keeps everyone in it. */
function lowestBy<T>(items: T[], value: (item: T) => number | null): T[] {
  const scored = items.filter((i) => value(i) !== null);
  if (scored.length === 0) return [];
  const best = Math.min(...scored.map((i) => value(i) as number));
  return scored.filter((i) => value(i) === best);
}

/**
 * Who led after each event that paid points, in order.
 *
 * The Championship pays nothing, so it cannot change the points race and is
 * excluded -- a recap that said the season "came down to the Championship"
 * would be inventing drama the rules forbid. That exclusion is the whole
 * reason this walks the rounds rather than trusting the final table.
 */
interface LeadStep {
  sequence: number;
  leaderIds: string[];
  /** Running points total per player after this event. */
  running: Map<string, number>;
}

function leadSequence(rounds: RecapRound[], standings: RecapStanding[]): LeadStep[] {
  const scoring = rounds.filter((r) => r.eventType !== 'championship');
  const sequences = [...new Set(scoring.map((r) => r.sequence))].sort((a, b) => a - b);
  const known = new Set(standings.map((s) => s.playerId));

  const running = new Map<string, number>();
  const out: LeadStep[] = [];

  for (const seq of sequences) {
    for (const r of scoring) {
      if (r.sequence !== seq || r.eventPoints === null) continue;
      if (!known.has(r.playerId)) continue;
      running.set(r.playerId, (running.get(r.playerId) ?? 0) + r.eventPoints);
    }
    if (running.size === 0) continue;
    const best = Math.min(...running.values());
    out.push({
      sequence: seq,
      leaderIds: [...running.entries()].filter(([, v]) => v === best).map(([id]) => id),
      running: new Map(running),
    });
  }
  return out;
}

/** How many times the lead actually changed hands. */
function leadChanges(sequence: LeadStep[]): number {
  let changes = 0;
  for (let i = 1; i < sequence.length; i++) {
    const before = new Set(sequence[i - 1].leaderIds);
    // A change means nobody who led before still leads. Joining or leaving a
    // shared lead is not the lead changing hands.
    if (sequence[i].leaderIds.every((id) => !before.has(id))) changes++;
  }
  return changes;
}

/**
 * How many times one player *took* the lead.
 *
 * Not the same as how many events they led, which is what a naive count
 * gives: leading events two, three and four is taking the lead once, and
 * "held the lead three times" overstates it into drama that did not happen.
 */
function timesTookLead(sequence: LeadStep[], playerId: string): number {
  let taken = 0;
  for (let i = 0; i < sequence.length; i++) {
    const leads = sequence[i].leaderIds.includes(playerId);
    const ledBefore = i > 0 && sequence[i - 1].leaderIds.includes(playerId);
    if (leads && !ledBefore) taken++;
  }
  return taken;
}

export function seasonRecapView(input: SeasonRecapInput): SeasonRecapView {
  const { year, standings, rounds } = input;
  const done = played(rounds);
  const nameOf = new Map(standings.map((s) => [s.playerId, s.playerName]));

  if (done.length === 0 || standings.length === 0) {
    const empty = `No rounds were recorded in ${year}.`;
    return { pointsWinners: [], paragraphs: [empty], summary: empty };
  }

  const pointsWinners = standings.filter(
    (s) => s.totalPoints === standings[0].totalPoints,
  );
  const champions = input.championIds
    .map((id) => standings.find((s) => s.playerId === id))
    .filter((s): s is RecapStanding => Boolean(s));

  const sequence = leadSequence(rounds, standings);
  const historyOf = new Map((input.history ?? []).map((h) => [h.playerId, h]));

  return assemble(input, {
    done,
    nameOf,
    pointsWinners,
    champions,
    sequence,
    historyOf,
  });
}

interface Context {
  done: RecapRound[];
  nameOf: Map<string, string>;
  pointsWinners: RecapStanding[];
  champions: RecapStanding[];
  sequence: LeadStep[];
  historyOf: Map<string, RecapHistory>;
}

function assemble(input: SeasonRecapInput, ctx: Context): SeasonRecapView {
  const out = paragraphs([
    headline(input, ctx),
    howItWasWon(input, ctx),
    theChase(input, ctx),
    footnotes(input, ctx),
  ]);
  return {
    pointsWinners: ctx.pointsWinners,
    paragraphs: out,
    summary: out.join(' '),
  };
}

/** Beat one: what was won, and where it sits in a career. */
function headline(input: SeasonRecapInput, ctx: Context): string {
  const { year, standings } = input;
  const { pointsWinners, champions } = ctx;
  if (pointsWinners.length === 0) return '';

  // A shared season has no single subject, so it is stated plainly and the
  // career claims -- which are about one person -- are skipped.
  if (pointsWinners.length > 1) {
    return paragraph([
      `${listWords(pointsWinners.map((w) => w.playerName))} finished ${year} level on ` +
        `${count(standings[0].totalPoints, 'point')} and shared the season.`,
      champions.length > 0
        ? `${listWords(champions.map((c) => c.playerName))} took the Championship.`
        : null,
    ]);
  }

  const winner = pointsWinners[0];
  const subject = new Subject(winner.playerName);
  const alsoChampion = champions.some((c) => c.playerId === winner.playerId);
  const runnerUp = standings.find((s) => s.totalPoints > winner.totalPoints) ?? null;
  const margin = marginOver(winner.totalPoints, runnerUp?.totalPoints ?? null);
  const changes = leadChanges(ctx.sequence);

  // The opening stacks the consequences rather than saving them: the trophy
  // and the season in one sentence, the way a wire report leads.
  const champEvent = ctx.done.find(
    (r) => r.eventType === 'championship' && r.playerId === winner.playerId,
  );
  const opening = alsoChampion
    ? `${subject.name()} won the Championship${atVenue(champEvent?.eventLabel)}, ` +
      `and with it the ${year} season`
    : `${subject.name()} won the ${year} season`;

  // The margin rides the opening sentence on a dash rather than starting a
  // new one, which is what stops the subject being named again immediately.
  const how =
    margin && changes >= 2
      ? ` — ${margin} clear of ${runnerUp?.playerName}, after the lead changed hands ${times(changes)}.`
      : margin
        ? ` — ${margin} clear of ${runnerUp?.playerName}.`
        : '.';

  return paragraph([opening + how, careerNote(input, ctx, winner, subject)]);
}

/** Where this season sits in the winner's career. Silent without history. */
function careerNote(
  input: SeasonRecapInput,
  ctx: Context,
  winner: RecapStanding,
  subject: Subject,
): string | null {
  const h = ctx.historyOf.get(winner.playerId);
  if (!h) return null;

  const titles = h.priorTitleYears.length;
  const seasonWins = ctx.done.filter(
    (r) => r.playerId === winner.playerId && r.place === 1,
  ).length;

  const claims: string[] = [];
  if (titles === 0 && h.priorSeasons > 0) {
    claims.push(
      `It was a first season title in ${count(h.priorSeasons + 1, 'year')} in the chapter`,
    );
  } else if (titles > 0) {
    const last = h.priorTitleYears[h.priorTitleYears.length - 1];
    claims.push(
      last === input.year - 1
        ? `That is back-to-back, and a ${ordinalWord(titles + 1)} title in all`
        : `It was a ${ordinalWord(titles + 1)} season title, and the first since ${last}`,
    );
  }

  // "Five of his seven career wins came this year" -- the move the wire
  // report makes, and only honest when most of them really did. This is the
  // one place the surname earns a second outing in the paragraph, because
  // the sentence is about a career rather than a season.
  if (h.careerWins > 0 && seasonWins > 1 && seasonWins >= h.careerWins / 2) {
    claims.push(
      `${word(seasonWins)} of ${subject.possessive()} ${count(h.careerWins, 'career win')} came this year alone`,
    );
  }

  return claims.length > 0 ? `${claims.join(', and ')}.` : null;
}

/** Beat two: the scoring line and the shape of the year. */
function howItWasWon(input: SeasonRecapInput, ctx: Context): string {
  const { pointsWinners, done } = ctx;
  if (pointsWinners.length !== 1) return '';
  const winner = pointsWinners[0];
  const subject = new Subject(winner.playerName);
  subject.full();

  const theirs = input.rounds
    .filter((r) => r.playerId === winner.playerId)
    .sort((a, b) => a.sequence - b.sequence);
  const theirPlayed = theirs.filter((r) => r.trueScore !== null);
  // Under three rounds there is no shape to describe, only a list.
  if (theirPlayed.length < 3) return '';

  const topThree = theirPlayed.filter((r) => r.place !== null && r.place <= 3).length;
  const outside = theirPlayed.length - topThree;
  const worst = theirPlayed.reduce((a, b) =>
    (b.netScore ?? -Infinity) > (a.netScore ?? -Infinity) ? b : a,
  );

  // The characterisation has to be earned from the counts rather than
  // asserted. Top three nearly every week is relentless; two brilliant days
  // and a quiet season is not, and gets no adjective.
  const relentless = outside <= 1 && theirPlayed.length >= 4;

  const shape =
    outside === 0
      ? `every one of them a top-three finish`
      : outside === 1
        ? `${word(topThree)} of them top-three finishes, and one bad afternoon${atVenue(worst.eventLabel)}`
        : `${word(topThree)} of them top-three finishes and ${count(outside, 'week')} outside`;

  const bestOfYear = lowestBy(done, (r) => r.netScore);
  const winnerHadBest =
    bestOfYear.length === 1 && bestOfYear[0].playerId === winner.playerId;

  // One sentence rather than three. The first draft opened three sentences
  // in a row with the same name, which is the exact texture that made these
  // read as machine-written.
  const line = `${count(theirs.length, 'net round')} of ${scoringLine(theirs.map((r) => r.netScore))}`;
  const opening = relentless
    ? `${subject.name()} was relentless rather than spectacular: ${line}, ${shape}.`
    : `${capitalise(subject.possessive())} season read ${line}, ${shape}.`;

  return paragraph([
    opening,
    winnerHadBest && bestOfYear[0].netScore !== null
      ? `That ${toParFigure(bestOfYear[0].netScore)}${atVenue(bestOfYear[0].eventLabel)} ` +
        `was the lowest round anyone in the chapter played all year.`
      : null,
  ]);
}

/** Beat three: whoever led and lost it. */
function theChase(input: SeasonRecapInput, ctx: Context): string {
  const { pointsWinners, sequence, nameOf } = ctx;
  if (pointsWinners.length !== 1 || sequence.length < 2) return '';
  const winner = pointsWinners[0];

  const sentences: string[] = [];
  const runIn = sequence[sequence.length - 1];
  const penultimate = sequence[sequence.length - 2];

  // The strongest version of this paragraph, and the one the wire reports
  // use: somebody led going into the last event that paid points and lost it
  // there. Note "that paid points" -- the Championship pays none, so it can
  // never be the run-in however dramatic it was.
  const ledIntoLast = penultimate.leaderIds.filter((id) => id !== winner.playerId);

  if (ledIntoLast.length > 0) {
    const chaserId = ledIntoLast[0];
    const chaser = new Subject(nameOf.get(chaserId) ?? '');
    const took = timesTookLead(sequence, chaserId);
    const gap = marginOver(
      penultimate.running.get(chaserId) ?? 0,
      penultimate.running.get(winner.playerId) ?? null,
    );
    const finale = input.rounds.find((r) => r.sequence === runIn.sequence);
    const venue = atVenue(finale?.eventLabel).replace(/^ at /, '');
    const chaserThere = input.rounds.find(
      (r) => r.sequence === runIn.sequence && r.playerId === chaserId,
    );
    const winnerWonIt =
      input.rounds.find(
        (r) => r.sequence === runIn.sequence && r.playerId === winner.playerId,
      )?.place === 1;

    sentences.push(
      took > 1
        ? `${chaser.name()} took the lead ${times(took)} and could not keep it.`
        : `${chaser.name()} led going into the last event that paid points.`,
    );

    const wentInto = venue ? `went into ${venue}` : 'went into the finale';
    const inFront = gap ? `${gap} in front` : 'in front';
    const champion = new Subject(winner.playerName).last();
    sentences.push(
      winnerWonIt
        ? `${chaser.name()} ${wentInto} ${inFront}, ${champion} won it` +
            (chaserThere?.place && chaserThere.place > 1
              ? `, ${chaser.last()} finished ${ordinalWord(chaserThere.place)}`
              : '') +
            `, and that was the season.`
        : `${chaser.name()} ${wentInto} ${inFront} and came out of it behind.`,
    );
  } else {
    const heldLead = new Set<string>();
    for (const step of sequence) {
      for (const id of step.leaderIds) if (id !== winner.playerId) heldLead.add(id);
    }
    if (heldLead.size > 0) {
      const names = [...heldLead].map((id) => nameOf.get(id) ?? '').filter(Boolean);
      sentences.push(`${listWords(names)} led at some point and could not hold on.`);
    }
  }

  // The playoff. A tie on the card settled by extra holes is a story the
  // scores by themselves cannot tell, because they still read as a tie.
  const losers = (input.playoffLoserIds ?? [])
    .map((id) => nameOf.get(id))
    .filter((n): n is string => Boolean(n));
  if (losers.length > 0) {
    const champ = ctx.champions[0];
    const champRound = ctx.done.find(
      (r) => r.eventType === 'championship' && r.playerId === champ?.playerId,
    );
    const only = losers.length === 1;
    const loserWins = only
      ? ctx.done.filter(
          (r) => r.playerId === (input.playoffLoserIds ?? [])[0] && r.place === 1,
        ).length
      : 0;
    const loser = new Subject(losers[0]);
    sentences.push(
      `${listWords(losers)} had a claim at the Championship too, matching ` +
        `${new Subject(champ?.playerName ?? 'the champion').last()}` +
        (typeof champRound?.netScore === 'number'
          ? ` at ${toParWords(champRound.netScore, false)}`
          : '') +
        ` before losing the playoff` +
        (only && loserWins === 1
          ? ` — the closest ${loser.last()} came to a win all year.`
          : '.'),
    );
  }

  return paragraph(sentences);
}

/** Beat four: what else is worth remembering. */
function footnotes(input: SeasonRecapInput, ctx: Context): string {
  const { done, pointsWinners } = ctx;
  const winnerId = pointsWinners[0]?.playerId;
  const sentences: string[] = [];

  // The best ball-striker who got nothing for it. This is the most
  // interesting recurring story in a handicap league, and it is entirely
  // countable: lowest gross, no wins.
  const bestGross = lowestBy(done, (r) => r.trueScore);
  if (bestGross.length === 1 && bestGross[0].playerId !== winnerId) {
    const striker = new Subject(bestGross[0].playerName);
    const theirs = done.filter((r) => r.playerId === bestGross[0].playerId);
    const wins = theirs.filter((r) => r.place === 1).length;
    const standing = input.standings.find((s) => s.playerId === bestGross[0].playerId);
    const worstGross = Math.max(...theirs.map((r) => r.trueScore as number));

    sentences.push(
      wins === 0 && standing
        ? `${striker.name()} played the best golf in the chapter and got nothing for it: ` +
            `the low gross round of the year at ${toParWords(bestGross[0].trueScore as number, false)}` +
            `${atVenue(bestGross[0].eventLabel)}, and never worse than ` +
            `${toParWords(worstGross, false)} all season — but giving strokes back ` +
            `off that handicap meant ${ordinalWord(standing.seasonRank)} place and no wins.`
        : `${striker.name()} shot the low gross round of the year, ` +
            `${toParWords(bestGross[0].trueScore as number, false)}${atVenue(bestGross[0].eventLabel)}.`,
    );
  }

  // Last year's winner, when the year went differently for them.
  const previous = input.previousChampionId
    ? input.standings.find((s) => s.playerId === input.previousChampionId)
    : null;
  if (previous && previous.playerId !== winnerId && previous.seasonRank > 3) {
    sentences.push(
      `And ${previous.playerName}, who won the ${input.year - 1} season, played ` +
        `${count(previous.eventsPlayed, 'event')} and finished ` +
        `${ordinalWord(previous.seasonRank)}.`,
    );
  }

  if (sentences.length === 0) return '';
  return paragraph([sentences.length > 1 ? 'Two footnotes.' : null, ...sentences]);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
