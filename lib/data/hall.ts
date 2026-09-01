import { createClient } from '@/lib/supabase/server';
import { computeStandings, NO_DROP, type DropRule } from '@/lib/domain/standings';
import type { HallSeasonInput } from '@/lib/domain/hall';
import type { EventType } from '@/lib/domain/types';

/**
 * Every Championship this chapter has played, with what surrounded it.
 *
 * Deliberately assembled in three queries rather than by calling the
 * per-season readers in a loop: a chapter with fourteen seasons would
 * otherwise fire more than fifty round trips to draw one page. Everything
 * after the fetch is arithmetic in memory.
 *
 * The season standings are recomputed here rather than read, because they
 * are not stored -- and because they must honour the season's own drop rule,
 * so a Seattle year names the points winner the drop rule actually produces
 * rather than the raw-total leader.
 */

const MAX_ROWS = 20000;

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function getHallSeasons(leagueId: string): Promise<HallSeasonInput[]> {
  const supabase = await createClient();

  const [{ data: seasonRows }, { data: eventRows }, { data: scoreRows }] =
    await Promise.all([
      supabase
        .from('seasons')
        .select('id, year, drop_worst_count, champion_player_id')
        .eq('league_id', leagueId),
      supabase
        .from('events')
        .select('id, season_id, event_type, name, course, sequence, status')
        .eq('league_id', leagueId)
        .limit(MAX_ROWS),
      supabase
        .from('scores')
        .select(
          'player_id, event_id, true_score, net_score, place, event_points, ' +
            'players!inner(name, photo_url)',
        )
        .eq('league_id', leagueId)
        .limit(MAX_ROWS),
    ]);

  const seasons = (seasonRows ?? []) as unknown as {
    id: string;
    year: number;
    drop_worst_count: number | null;
    champion_player_id: string | null;
  }[];
  const events = (eventRows ?? []) as unknown as {
    id: string;
    season_id: string;
    event_type: EventType;
    name: string | null;
    course: string | null;
    sequence: number;
    status: string;
  }[];
  const scores = (scoreRows ?? []) as unknown as Record<string, unknown>[];

  const eventById = new Map(events.map((e) => [e.id, e]));
  const nameOf = new Map<string, { name: string; photoUrl: string | null }>();
  for (const s of scores) {
    const p = s.players as { name: string; photo_url: string | null };
    nameOf.set(s.player_id as string, { name: p.name, photoUrl: p.photo_url });
  }

  const out: HallSeasonInput[] = [];

  for (const season of seasons) {
    const seasonEvents = events.filter(
      (e) => e.season_id === season.id && e.status !== 'cancelled',
    );
    const championship = seasonEvents.find((e) => e.event_type === 'championship');

    // A season with no Championship played has no champion to enshrine.
    if (!championship) continue;
    const played = scores.filter(
      (s) => s.event_id === championship.id && num(s.true_score) !== null,
    );
    if (played.length === 0) continue;

    const rule: DropRule =
      season.drop_worst_count && season.drop_worst_count > 0
        ? { dropWorst: season.drop_worst_count, minResults: 2 }
        : NO_DROP;

    const scoring = new Set(
      seasonEvents.filter((e) => e.event_type !== 'championship').map((e) => e.id),
    );
    const standings = computeStandings(
      scores
        .filter(
          (s) => scoring.has(s.event_id as string) && num(s.event_points) !== null,
        )
        .map((s) => {
          const e = eventById.get(s.event_id as string);
          return {
            playerId: s.player_id as string,
            eventPoints: num(s.event_points) as number,
            eventId: s.event_id as string,
            sequence: e?.sequence,
            droppable: e?.event_type !== 'major',
          };
        }),
      rule,
    );
    const rankOf = new Map(standings.map((s) => [s.playerId, s.seasonRank]));
    const pointsWinners = standings
      .filter((s) => s.seasonRank === 1)
      .map((s) => ({
        playerId: s.playerId,
        name: nameOf.get(s.playerId)?.name ?? 'Unknown player',
      }));

    const champions = played
      .filter((s) => num(s.place) === 1)
      .map((s) => {
        const id = s.player_id as string;
        const who = nameOf.get(id);
        return {
          playerId: id,
          name: who?.name ?? 'Unknown player',
          photoUrl: who?.photoUrl ?? null,
          netScore: num(s.net_score),
          seasonRank: rankOf.get(id) ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // The best score behind the winners, for the margin.
    const chasing = played
      .filter((s) => (num(s.place) ?? 0) > 1 && num(s.net_score) !== null)
      .sort((a, b) => (num(a.net_score) as number) - (num(b.net_score) as number))[0];

    // The field is the season's, not the day's.
    //
    // A Championship is often contested by a subset -- Iowa 2026 had six
    // players on the tee out of a season that ran to ten. Counting only
    // those six understates what the title was won against: the champion
    // saw off a year's worth of golfers to get there, and that is the
    // number worth printing.
    const seasonField = new Set(
      scores
        .filter(
          (sc) =>
            seasonEvents.some((e) => e.id === (sc.event_id as string)) &&
            num(sc.true_score) !== null,
        )
        .map((sc) => sc.player_id as string),
    );

    out.push({
      year: season.year,
      decidedBy: season.champion_player_id,
      where: championship.course?.trim() || championship.name?.trim() || null,
      champions,
      runnerUp: chasing
        ? {
            name: nameOf.get(chasing.player_id as string)?.name ?? 'Unknown player',
            netScore: num(chasing.net_score),
          }
        : null,
      fieldSize: seasonField.size,
      pointsWinners,
    });
  }

  return out;
}
