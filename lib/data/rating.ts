import { createClient } from '@/lib/supabase/server';
import type { RatingRound } from '@/lib/domain/rating';
import type { EventType } from '@/lib/domain/types';

/**
 * Every round either chapter has on record, for the cross-chapter rating.
 *
 * Like the record book, this is deliberately league-wide: the ranking is one
 * table across AAGLA rather than one per chapter, and the two are joined
 * only by the handful of people who have played both. Roster rows are
 * stitched back into people by name, the same match the player page and the
 * records board use, with the same caveat -- two different people sharing a
 * name would merge.
 *
 * Row-level security still decides what comes back. A viewer who cannot see
 * a chapter gets a ranking computed without it rather than an error.
 */

const MAX_ROWS = 20000;

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function getRatingRounds(): Promise<RatingRound[]> {
  const supabase = await createClient();

  const [{ data: leagueRows }, { data: playerRows }, { data: scoreRows }] =
    await Promise.all([
      supabase.from('leagues').select('id, slug, name, chapter'),
      supabase.from('players').select('id, league_id, name, photo_url').limit(MAX_ROWS),
      supabase
        .from('scores')
        .select(
          'player_id, true_score, events!inner(id, event_type, seasons!inner(year))',
        )
        .limit(MAX_ROWS),
    ]);

  const leagues = new Map(
    (
      (leagueRows ?? []) as unknown as {
        id: string;
        slug: string;
        name: string;
        chapter: string | null;
      }[]
    ).map((l) => [l.id, l]),
  );

  const players = new Map(
    (
      (playerRows ?? []) as unknown as {
        id: string;
        league_id: string;
        name: string;
        photo_url: string | null;
      }[]
    ).map((p) => [p.id, p]),
  );

  const rounds: RatingRound[] = [];
  for (const row of (scoreRows ?? []) as unknown as Record<string, unknown>[]) {
    const player = players.get(row.player_id as string);
    if (!player) continue;
    const league = leagues.get(player.league_id);
    // RLS hid the chapter, so there is nothing to label this round with.
    if (!league) continue;

    const ev = row.events as {
      id: string;
      event_type: EventType;
      seasons: { year: number } | { year: number }[];
    };

    rounds.push({
      playerId: player.id,
      personKey: normaliseName(player.name),
      name: player.name.trim(),
      photoUrl: player.photo_url,
      chapterLabel: league.chapter ?? league.name,
      leagueSlug: league.slug,
      year: Array.isArray(ev.seasons) ? ev.seasons[0].year : ev.seasons.year,
      eventId: ev.id,
      eventType: ev.event_type,
      grossScore: num(row.true_score),
    });
  }

  return rounds;
}
