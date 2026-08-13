import { createClient } from '@/lib/supabase/server';
import type { CareerRound } from '@/lib/domain/career';
import type { RecordPerson } from '@/lib/domain/records';
import type { EventType, PlayerStatus } from '@/lib/domain/types';

/**
 * Every person in the league, across every chapter, for the records board.
 *
 * This is the only read in the app that deliberately looks at all leagues at
 * once. Records belong to people rather than roster rows, so the five members
 * who turn out for both AAGLA chapters are stitched back into one career here
 * by name -- the same match the player page uses, and the same caveat applies:
 * two different people sharing a name would merge. A `people` table above
 * `players` is the real fix when that day comes.
 *
 * Row-level security still decides what comes back. A viewer who cannot see a
 * chapter simply gets records computed without it, rather than an error.
 */

/** PostgREST caps a response at 1000 rows by default, and the league is
 *  already past 900 scores. Ask for far more than that explicitly, so the
 *  board doesn't start silently dropping the oldest seasons one day. */
const MAX_ROWS = 20000;

function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function yearOf(value: unknown): number {
  const s = value as { year: number } | { year: number }[];
  return Array.isArray(s) ? s[0].year : s.year;
}

export async function getRecordPeople(): Promise<RecordPerson[]> {
  const supabase = await createClient();

  const [
    { data: leagueRows },
    { data: playerRows },
    { data: scoreRows },
    { data: hcRows },
  ] = await Promise.all([
    supabase.from('leagues').select('id, slug, name, chapter'),
    supabase
      .from('players')
      .select('id, league_id, name, photo_url, status')
      .limit(MAX_ROWS),
    supabase
      .from('scores')
      .select(
        'player_id, true_score, fs_applied, net_score, place, event_points, ' +
          'events!inner(name, event_type, sequence, seasons!inner(year))',
      )
      .limit(MAX_ROWS),
    supabase
      .from('handicaps')
      .select('player_id, fs, seasons!inner(year)')
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

  const roundsByPlayer = new Map<string, CareerRound[]>();
  for (const r of (scoreRows ?? []) as unknown as Record<string, unknown>[]) {
    const ev = r.events as {
      name: string | null;
      event_type: EventType;
      sequence: number;
      seasons: { year: number } | { year: number }[];
    };
    const pid = r.player_id as string;
    const list = roundsByPlayer.get(pid) ?? [];
    list.push({
      year: yearOf(ev.seasons),
      eventType: ev.event_type,
      eventName: ev.name,
      sequence: ev.sequence,
      trueScore: num(r.true_score),
      fsApplied: num(r.fs_applied),
      netScore: num(r.net_score),
      place: num(r.place),
      eventPoints: num(r.event_points),
    });
    roundsByPlayer.set(pid, list);
  }

  const handicapsByPlayer = new Map<string, { year: number; fs: number }[]>();
  for (const r of (hcRows ?? []) as unknown as Record<string, unknown>[]) {
    const pid = r.player_id as string;
    const list = handicapsByPlayer.get(pid) ?? [];
    // Whole strokes, rounded on read: a figure locked before that was the
    // rule can still carry a decimal, and a record shown to one decimal
    // would disagree with the same number everywhere else in the app.
    list.push({ year: yearOf(r.seasons), fs: Math.round(num(r.fs) ?? 0) });
    handicapsByPlayer.set(pid, list);
  }

  const byPerson = new Map<string, RecordPerson>();
  for (const p of (playerRows ?? []) as unknown as {
    id: string;
    league_id: string;
    name: string;
    photo_url: string | null;
    status: PlayerStatus;
  }[]) {
    const league = leagues.get(p.league_id);
    // RLS hid the league, so there is nothing to label this chapter with.
    if (!league) continue;

    const key = normaliseName(p.name);
    const existing = byPerson.get(key);
    const chapter = {
      leagueId: league.id,
      leagueSlug: league.slug,
      label: league.chapter ?? league.name,
      playerId: p.id,
      status: p.status,
      rounds: (roundsByPlayer.get(p.id) ?? []).sort(
        (a, b) => a.year - b.year || a.sequence - b.sequence,
      ),
      handicaps: (handicapsByPlayer.get(p.id) ?? []).sort((a, b) => a.year - b.year),
    };

    if (existing) {
      existing.chapters.push(chapter);
      // Prefer any real photo over none, whichever chapter carries it.
      existing.photoUrl = existing.photoUrl ?? p.photo_url;
    } else {
      byPerson.set(key, {
        key,
        name: p.name.trim(),
        photoUrl: p.photo_url,
        chapters: [chapter],
      });
    }
  }

  for (const person of byPerson.values()) {
    person.chapters.sort((a, b) => a.label.localeCompare(b.label));
  }

  return [...byPerson.values()];
}

/** Numeric columns arrive from PostgREST as strings, to preserve precision. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}
