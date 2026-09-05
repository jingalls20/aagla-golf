import { createClient } from '@/lib/supabase/server';
import { computeStandings, NO_DROP, type DropRule } from '@/lib/domain/standings';
import type { RecapHistory } from '@/lib/domain/offseason';
import type { EventType } from '@/lib/domain/types';

/**
 * The chapter's past, for the season recap.
 *
 * A recap that can say "his first season title in four years" reads like
 * someone who was there; one that cannot reads like a table with sentences
 * around it. That single clause is the difference, and it needs every prior
 * season rather than the one being described -- hence a module of its own
 * rather than another field bolted onto `getStandings`.
 *
 * Prior seasons are recomputed rather than read off anything stored, because
 * nothing stores them: the winner of 2019 is whoever the points say, and the
 * points depend on that season's own drop rule. Seattle drops a worst finish
 * from 2026 and did not before, so a single rule applied across the archive
 * would quietly rewrite history.
 *
 * One deliberate limit: this is per chapter. A player's Iowa titles are not
 * their Seattle titles, and pooling them would produce a career nobody had.
 */

const MAX_ROWS = 20000;

export interface RecapPast {
  history: RecapHistory[];
  /** Whoever took the previous season on points, when exactly one did. */
  previousChampionId: string | null;
}

interface Row {
  playerId: string;
  year: number;
  eventId: string;
  sequence: number;
  eventType: EventType;
  eventPoints: number | null;
  place: number | null;
  played: boolean;
}

function ruleFor(dropWorstCount: number | null | undefined): DropRule {
  const count = Number(dropWorstCount);
  if (!Number.isFinite(count) || count <= 0) return NO_DROP;
  return { dropWorst: count, minResults: 2 };
}

/** Everyone tied on the lowest points total that season. */
function winnersOf(rows: Row[], rule: DropRule): string[] {
  const scoring = rows.filter(
    (r) => r.eventType !== 'championship' && r.eventPoints !== null,
  );
  if (scoring.length === 0) return [];

  const ranked = computeStandings(
    scoring.map((r) => ({
      playerId: r.playerId,
      eventPoints: r.eventPoints as number,
      eventId: r.eventId,
      sequence: r.sequence,
      droppable: r.eventType !== 'major',
    })),
    rule,
  );
  return ranked.filter((s) => s.seasonRank === 1).map((s) => s.playerId);
}

export async function getRecapPast(leagueId: string, year: number): Promise<RecapPast> {
  const supabase = await createClient();

  const [{ data: seasonRows }, { data: scoreRows }] = await Promise.all([
    supabase
      .from('seasons')
      .select('id, year, drop_worst_count')
      .eq('league_id', leagueId),
    supabase
      .from('scores')
      .select(
        'player_id, true_score, event_points, place, ' +
          'events!inner(id, sequence, event_type, seasons!inner(year))',
      )
      .eq('league_id', leagueId)
      .limit(MAX_ROWS),
  ]);

  const ruleByYear = new Map<number, DropRule>(
    (
      (seasonRows ?? []) as unknown as {
        year: number;
        drop_worst_count: number | null;
      }[]
    ).map((s) => [s.year, ruleFor(s.drop_worst_count)]),
  );

  const rows: Row[] = [];
  for (const raw of (scoreRows ?? []) as unknown as Record<string, unknown>[]) {
    const ev = raw.events as {
      id: string;
      sequence: number;
      event_type: EventType;
      seasons: { year: number } | { year: number }[];
    };
    rows.push({
      playerId: raw.player_id as string,
      year: Array.isArray(ev.seasons) ? ev.seasons[0].year : ev.seasons.year,
      eventId: ev.id,
      sequence: ev.sequence,
      eventType: ev.event_type,
      eventPoints: raw.event_points === null ? null : Number(raw.event_points),
      place: raw.place === null ? null : Number(raw.place),
      played: raw.true_score !== null,
    });
  }

  const priorYears = [...new Set(rows.map((r) => r.year))]
    .filter((y) => y < year)
    .sort((a, b) => a - b);

  // Which seasons each player has already won.
  const titlesByPlayer = new Map<string, number[]>();
  for (const y of priorYears) {
    const winners = winnersOf(
      rows.filter((r) => r.year === y),
      ruleByYear.get(y) ?? NO_DROP,
    );
    for (const id of winners) {
      titlesByPlayer.set(id, [...(titlesByPlayer.get(id) ?? []), y]);
    }
  }

  // Last season's winner, but only when there was exactly one -- "who won
  // last year" has no single answer after a shared season, and the recap
  // says nothing rather than picking.
  const lastYear = priorYears[priorYears.length - 1];
  const lastWinners =
    lastYear === undefined
      ? []
      : winnersOf(
          rows.filter((r) => r.year === lastYear),
          ruleByYear.get(lastYear) ?? NO_DROP,
        );

  const players = [...new Set(rows.map((r) => r.playerId))];
  const history: RecapHistory[] = players.map((playerId) => {
    const theirs = rows.filter((r) => r.playerId === playerId);
    return {
      playerId,
      priorTitleYears: titlesByPlayer.get(playerId) ?? [],
      // Career wins include this season: "five of his seven came this year"
      // needs the seven to be the whole career, not the years before it.
      careerWins: theirs.filter((r) => r.played && r.place === 1).length,
      priorSeasons: new Set(
        theirs.filter((r) => r.played && r.year < year).map((r) => r.year),
      ).size,
    };
  });

  return {
    history,
    previousChampionId: lastWinners.length === 1 ? lastWinners[0] : null,
  };
}
