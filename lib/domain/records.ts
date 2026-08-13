import { isPlayed, type CareerRound } from './career';

/**
 * All-time league records.
 *
 * Everything here is computed across chapters, because a record belongs to a
 * person rather than to a roster row. The five people who play in both AAGLA
 * chapters have a separate `players` row in each, and this is the one place in
 * the app where those rows are deliberately treated as one career: counting
 * records add their chapters together, and "best ever" records take whichever
 * chapter the best came from and say so.
 *
 * That is the opposite of the rule everywhere else -- season lines and
 * handicaps stay strictly per chapter, since a handicap earned in Iowa says
 * nothing about Seattle. It holds here because a record asks "who has the most
 * / the lowest, ever", and that question is about the person.
 *
 * Pure, like the rest of this directory: no client, no clock. The board is a
 * function of the careers handed in, which is what makes it testable against
 * hand-built edge cases -- ties, single-round players, missing handicaps.
 */

/** One chapter's worth of a person's history. */
export interface RecordChapter {
  leagueId: string;
  leagueSlug: string;
  /** Display label, e.g. "Iowa". */
  label: string;
  playerId: string;
  rounds: CareerRound[];
  handicaps: { year: number; fs: number }[];
}

export interface RecordPerson {
  /** Normalised name; identity across chapters. */
  key: string;
  name: string;
  photoUrl: string | null;
  chapters: RecordChapter[];
}

export interface RecordEntry {
  key: string;
  name: string;
  photoUrl: string | null;
  /** Player row to link to, chosen by the page from the chapters below. */
  chapters: { leagueSlug: string; playerId: string }[];
  value: number;
  /** Where and when it happened, when that means something. */
  detail: string;
}

/** All the people sharing one value. More than one entry is a tie. */
export interface RecordTier {
  value: number;
  entries: RecordEntry[];
}

export type RecordFormat = 'count' | 'toPar' | 'strokes' | 'avg';

export interface RecordBoard {
  key: string;
  title: string;
  blurb: string;
  format: RecordFormat;
  /** Best first. `tiers[0]` holds the record; the rest are the chase. */
  tiers: RecordTier[];
}

/** Minimum rounds before a season's scoring average can hold a record. A
 *  season runs 6-9 events here, so this is roughly a full commitment and stops
 *  three good afternoons outranking someone who played the whole year. */
export const SEASON_AVG_MIN_ROUNDS = 5;

/** How many distinct values to show: the record, then two more behind it. */
const TIERS = 3;

function allRounds(p: RecordPerson): CareerRound[] {
  return p.chapters.flatMap((c) => c.rounds);
}

function chapterRefs(p: RecordPerson) {
  return p.chapters.map((c) => ({ leagueSlug: c.leagueSlug, playerId: c.playerId }));
}

/** One person's candidate for a record, or null if they don't qualify. */
type Candidate = { value: number; detail: string } | null;

/**
 * Rank people into tiers by value, best first.
 *
 * `better` is a comparator returning true when a beats b, so the same code
 * serves "most" and "lowest" records. People sharing a value land in one tier
 * and jointly hold that position, which is what makes a tie read as two
 * holders rather than an arbitrary winner.
 */
function board(
  key: string,
  title: string,
  blurb: string,
  format: RecordFormat,
  people: RecordPerson[],
  candidateOf: (p: RecordPerson) => Candidate,
  lowerIsBetter: boolean,
): RecordBoard {
  const entries: RecordEntry[] = [];
  for (const p of people) {
    const c = candidateOf(p);
    if (c === null) continue;
    entries.push({
      key: p.key,
      name: p.name,
      photoUrl: p.photoUrl,
      chapters: chapterRefs(p),
      value: c.value,
      detail: c.detail,
    });
  }

  const byValue = new Map<number, RecordEntry[]>();
  for (const e of entries) {
    const list = byValue.get(e.value) ?? [];
    list.push(e);
    byValue.set(e.value, list);
  }

  const tiers = [...byValue.entries()]
    .sort((a, b) => (lowerIsBetter ? a[0] - b[0] : b[0] - a[0]))
    .slice(0, TIERS)
    .map(([value, es]) => ({
      value,
      // Alphabetical within a tie, so a shared record has no implied order.
      entries: [...es].sort((a, b) => a.name.localeCompare(b.name)),
    }));

  return { key, title, blurb, format, tiers };
}

function chapterList(p: RecordPerson): string {
  const played = p.chapters.filter((c) => c.rounds.some(isPlayed));
  if (played.length === 0) return '';
  if (played.length === 1) return played[0].label;
  return played.map((c) => c.label).join(' + ');
}

/** Best (lowest) single round across every chapter, by whichever field. */
function bestRound(
  p: RecordPerson,
  pick: (r: CareerRound) => number | null,
): Candidate {
  let best: { value: number; round: CareerRound; label: string } | null = null;
  for (const c of p.chapters) {
    for (const r of c.rounds) {
      if (!isPlayed(r)) continue;
      const v = pick(r);
      if (v === null) continue;
      if (best === null || v < best.value)
        best = { value: v, round: r, label: c.label };
    }
  }
  if (best === null) return null;
  const where = best.round.eventName?.trim() || `event #${best.round.sequence}`;
  return { value: best.value, detail: `${where}, ${best.round.year} · ${best.label}` };
}

function countWins(p: RecordPerson, type: CareerRound['eventType']): Candidate {
  const won = allRounds(p).filter(
    (r) => isPlayed(r) && r.eventType === type && r.place === 1,
  );
  if (won.length === 0) return null;
  const years = [...new Set(won.map((r) => r.year))].sort((a, b) => a - b);
  return { value: won.length, detail: years.join(', ') };
}

export function buildRecords(people: RecordPerson[]): RecordBoard[] {
  return [
    board(
      'events',
      'Most events played',
      'Every round posted, both chapters counted together.',
      'count',
      people,
      (p) => {
        const n = allRounds(p).filter(isPlayed).length;
        if (n === 0) return null;
        const years = allRounds(p)
          .filter(isPlayed)
          .map((r) => r.year);
        const span = `${Math.min(...years)}–${Math.max(...years)}`;
        const where = chapterList(p);
        return { value: n, detail: where ? `${span} · ${where}` : span };
      },
      false,
    ),

    board(
      'majors',
      'Most majors won',
      'First place in a Major.',
      'count',
      people,
      (p) => countWins(p, 'major'),
      false,
    ),

    board(
      'championships',
      'Most Championships',
      'First place in a Championship, the one that closes a season.',
      'count',
      people,
      (p) => countWins(p, 'championship'),
      false,
    ),

    board(
      'lowest-net',
      'Lowest net round',
      'The single best round anyone has played after handicap.',
      'toPar',
      people,
      (p) => bestRound(p, (r) => r.netScore),
      true,
    ),

    board(
      'lowest-gross',
      'Lowest gross round',
      'The single best round before handicap — raw strokes against par.',
      'toPar',
      people,
      (p) => bestRound(p, (r) => r.trueScore),
      true,
    ),

    board(
      'lowest-handicap',
      'Lowest handicap',
      'The lowest figure anyone has ever played a season off.',
      'strokes',
      people,
      (p) => {
        let best: { fs: number; year: number; label: string } | null = null;
        for (const c of p.chapters) {
          for (const h of c.handicaps) {
            if (best === null || h.fs < best.fs) {
              best = { fs: h.fs, year: h.year, label: c.label };
            }
          }
        }
        return best === null
          ? null
          : { value: best.fs, detail: `${best.year} · ${best.label}` };
      },
      true,
    ),

    board(
      'turnaround',
      'Biggest turnaround',
      'The largest fall from any handicap to a lower one in a later season — the best improvement ever actually reached, even if it drifted back after.',
      'strokes',
      people,
      (p) => bestDrop(p, 'peak-to-later-low'),
      false,
    ),

    board(
      'career-improvement',
      'Most improved career',
      'First season handicap against the most recent one. Where they started, against where they are now.',
      'strokes',
      people,
      (p) => bestDrop(p, 'first-to-last'),
      false,
    ),

    board(
      'best-leap',
      'Biggest single-season leap',
      'The largest fall between one season’s handicap and the next.',
      'strokes',
      people,
      (p) => bestDrop(p, 'consecutive'),
      false,
    ),

    board(
      'season-avg',
      'Best season average',
      `Lowest average net across a season, minimum ${SEASON_AVG_MIN_ROUNDS} rounds.`,
      'avg',
      people,
      (p) => {
        let best: { avg: number; year: number; label: string; n: number } | null = null;
        for (const c of p.chapters) {
          const years = [...new Set(c.rounds.filter(isPlayed).map((r) => r.year))];
          for (const year of years) {
            const nets = c.rounds
              .filter((r) => r.year === year && isPlayed(r) && r.netScore !== null)
              .map((r) => r.netScore as number);
            if (nets.length < SEASON_AVG_MIN_ROUNDS) continue;
            const avg =
              Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100;
            if (best === null || avg < best.avg) {
              best = { avg, year, label: c.label, n: nets.length };
            }
          }
        }
        return best === null
          ? null
          : {
              value: best.avg,
              detail: `${best.year} · ${best.label} · ${best.n} rounds`,
            };
      },
      true,
    ),
  ];
}

type DropKind = 'peak-to-later-low' | 'first-to-last' | 'consecutive';

/**
 * Handicap movement, in three readings, all of them measured inside a single
 * chapter.
 *
 * That constraint matters. A player's Iowa handicap and their Seattle one are
 * different numbers describing different fields, so subtracting one from the
 * other would invent a drop that nobody achieved. A person with both takes
 * whichever chapter gives the larger honest figure.
 *
 * Only falls count. A handicap that rose returns nothing rather than a
 * negative, since none of these records are about getting worse.
 */
function bestDrop(p: RecordPerson, kind: DropKind): Candidate {
  let best: Candidate = null;
  const keep = (drop: number, detail: string) => {
    if (drop > 0 && (best === null || drop > best.value)) {
      best = { value: drop, detail };
    }
  };

  for (const c of p.chapters) {
    const hs = [...c.handicaps].sort((a, b) => a.year - b.year);
    if (hs.length < 2) continue;

    if (kind === 'first-to-last') {
      const from = hs[0];
      const to = hs[hs.length - 1];
      keep(
        from.fs - to.fs,
        `${from.fs} in ${from.year} \u2192 ${to.fs} in ${to.year} \u00b7 ${c.label}`,
      );
      continue;
    }

    if (kind === 'consecutive') {
      for (let i = 1; i < hs.length; i++) {
        keep(
          hs[i - 1].fs - hs[i].fs,
          `${hs[i - 1].fs} \u2192 ${hs[i].fs} in ${hs[i].year} \u00b7 ${c.label}`,
        );
      }
      continue;
    }

    // peak-to-later-low: the low has to come after the high, or it is a rise
    // being read backwards.
    for (let i = 0; i < hs.length; i++) {
      for (let j = i + 1; j < hs.length; j++) {
        keep(
          hs[i].fs - hs[j].fs,
          `${hs[i].fs} in ${hs[i].year} \u2192 ${hs[j].fs} in ${hs[j].year} \u00b7 ${c.label}`,
        );
      }
    }
  }

  return best;
}
