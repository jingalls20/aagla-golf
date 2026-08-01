import { createClient } from '@/lib/supabase/server';
import { computeStandings, round2 } from '@/lib/domain/standings';
import type { EventType, ScoreSource, StandingRow } from '@/lib/domain/types';

/**
 * Read queries for the league screens.
 *
 * Two things are deliberate here.
 *
 * First, nothing filters by permission. Row-level security decides what this
 * client can see, so a query asks for what the page needs and renders whatever
 * comes back. Adding a `.eq('league_id', ...)` guard "for safety" would be
 * duplicating the policy in a second place, where it can drift.
 *
 * Second, season standings are computed in TypeScript from the tested domain
 * functions rather than in SQL. The rules are subtle enough (dense ranking,
 * Championships excluded, rounding before ranking) that having one
 * implementation, under test, beats having a faster one nobody can verify.
 */

export interface League {
  id: string;
  slug: string;
  name: string;
  chapter: string | null;
}

export interface LeagueEvent {
  id: string;
  legacyId: number | null;
  sequence: number;
  eventType: EventType;
  name: string | null;
  status: 'scheduled' | 'played' | 'cancelled';
  year: number;
}

export interface ScoreRow {
  id: string;
  eventId: string;
  playerId: string;
  playerName: string;
  trueScore: number | null;
  fsApplied: number | null;
  courseDifferential: number;
  netScore: number | null;
  place: number | null;
  eventPoints: number | null;
  source: ScoreSource;
}

/** Numeric columns arrive from PostgREST as strings, to preserve precision. */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

export async function getLeagues(): Promise<League[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('leagues')
    .select('id, slug, name, chapter')
    .order('name');
  return (data ?? []) as unknown as League[];
}

export async function getLeague(slug: string): Promise<League | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('leagues')
    .select('id, slug, name, chapter')
    .eq('slug', slug)
    .maybeSingle();
  return (data as unknown as League) ?? null;
}

export async function getSeasonYears(leagueId: string): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('year')
    .eq('league_id', leagueId)
    .order('year', { ascending: false });
  return ((data ?? []) as unknown as { year: number }[]).map((r) => r.year);
}

export async function getEvents(leagueId: string, year?: number): Promise<LeagueEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('id, legacy_id, sequence, event_type, name, status, seasons!inner(year)')
    .eq('league_id', leagueId)
    .order('sequence', { ascending: true });

  const rows = (data ?? []) as unknown as {
    id: string;
    legacy_id: number | null;
    sequence: number;
    event_type: EventType;
    name: string | null;
    status: LeagueEvent['status'];
    seasons: { year: number } | { year: number }[];
  }[];

  return rows
    .map((r) => ({
      id: r.id,
      legacyId: r.legacy_id,
      sequence: r.sequence,
      eventType: r.event_type,
      name: r.name,
      status: r.status,
      year: Array.isArray(r.seasons) ? r.seasons[0].year : r.seasons.year,
    }))
    .filter((e) => year === undefined || e.year === year);
}

/** Every score in a season, with player names attached. */
export async function getSeasonScores(
  leagueId: string,
  year: number,
): Promise<ScoreRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('scores')
    .select(
      'id, event_id, player_id, true_score, fs_applied, course_differential, ' +
        'net_score, place, event_points, source, ' +
        'players!inner(name), events!inner(seasons!inner(year))',
    )
    .eq('league_id', leagueId);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows
    .filter((r) => {
      const ev = r.events as { seasons: { year: number } | { year: number }[] };
      const y = Array.isArray(ev.seasons) ? ev.seasons[0].year : ev.seasons.year;
      return y === year;
    })
    .map((r) => {
      const player = r.players as { name: string } | { name: string }[];
      return {
        id: r.id as string,
        eventId: r.event_id as string,
        playerId: r.player_id as string,
        playerName: Array.isArray(player) ? player[0].name : player.name,
        trueScore: num(r.true_score),
        fsApplied: num(r.fs_applied),
        courseDifferential: num(r.course_differential) ?? 0,
        netScore: num(r.net_score),
        place: num(r.place),
        eventPoints: num(r.event_points),
        source: r.source as ScoreSource,
      };
    });
}

export interface StandingWithName extends StandingRow {
  playerName: string;
  handicap: number | null;
}

/**
 * Season standings.
 *
 * Championship results are filtered out before ranking, and so are rows with no
 * points recorded — both match what the Apps Script app did, and both matter:
 * including Championships would inflate "events played" without moving any
 * total, since they are worth zero.
 */
export async function getStandings(
  leagueId: string,
  year: number,
): Promise<StandingWithName[]> {
  const [scores, events, handicaps] = await Promise.all([
    getSeasonScores(leagueId, year),
    getEvents(leagueId, year),
    getHandicaps(leagueId, year),
  ]);

  const countsTowardSeason = new Set(
    events.filter((e) => e.eventType !== 'championship').map((e) => e.id),
  );

  const ranked = computeStandings(
    scores
      .filter((s) => countsTowardSeason.has(s.eventId) && s.eventPoints !== null)
      .map((s) => ({ playerId: s.playerId, eventPoints: s.eventPoints as number })),
  );

  const nameOf = new Map(scores.map((s) => [s.playerId, s.playerName]));
  const fsOf = new Map(handicaps.map((h) => [h.playerId, h.fs]));

  return ranked.map((r) => ({
    ...r,
    playerName: nameOf.get(r.playerId) ?? 'Unknown player',
    handicap: fsOf.get(r.playerId) ?? null,
  }));
}

export interface HandicapRow {
  playerId: string;
  playerName: string;
  status: 'active' | 'inactive';
  fs: number;
  note: string | null;
  isOverride: boolean;
}

export async function getHandicaps(
  leagueId: string,
  year: number,
): Promise<HandicapRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('handicaps')
    .select('fs, note, is_override, players!inner(id, name, status), seasons!inner(year)')
    .eq('league_id', leagueId);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows
    .filter((r) => {
      const s = r.seasons as { year: number } | { year: number }[];
      return (Array.isArray(s) ? s[0].year : s.year) === year;
    })
    .map((r) => {
      const p = r.players as
        | { id: string; name: string; status: 'active' | 'inactive' }
        | { id: string; name: string; status: 'active' | 'inactive' }[];
      const player = Array.isArray(p) ? p[0] : p;
      return {
        playerId: player.id,
        playerName: player.name,
        status: player.status,
        fs: round2(num(r.fs) ?? 0) as number,
        note: (r.note as string | null) ?? null,
        isOverride: Boolean(r.is_override),
      };
    })
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
}

export async function getEventResults(eventId: string): Promise<ScoreRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('scores')
    .select(
      'id, event_id, player_id, true_score, fs_applied, course_differential, ' +
        'net_score, place, event_points, source, players!inner(name)',
    )
    .eq('event_id', eventId);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows
    .map((r) => {
      const player = r.players as { name: string } | { name: string }[];
      return {
        id: r.id as string,
        eventId: r.event_id as string,
        playerId: r.player_id as string,
        playerName: Array.isArray(player) ? player[0].name : player.name,
        trueScore: num(r.true_score),
        fsApplied: num(r.fs_applied),
        courseDifferential: num(r.course_differential) ?? 0,
        netScore: num(r.net_score),
        place: num(r.place),
        eventPoints: num(r.event_points),
        source: r.source as ScoreSource,
      };
    })
    .sort((a, b) => (a.place ?? 999) - (b.place ?? 999));
}

export interface PlayerProfile {
  id: string;
  name: string;
  status: 'active' | 'inactive';
  firstYear: number | null;
  rounds: {
    year: number;
    eventType: EventType;
    eventName: string | null;
    sequence: number;
    trueScore: number | null;
    fsApplied: number | null;
    netScore: number | null;
    place: number | null;
    eventPoints: number | null;
  }[];
  handicapHistory: { year: number; fs: number }[];
}

export async function getPlayerProfile(
  leagueId: string,
  playerId: string,
): Promise<PlayerProfile | null> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, name, status, first_year')
    .eq('league_id', leagueId)
    .eq('id', playerId)
    .maybeSingle();
  if (!player) return null;

  const [{ data: scoreRows }, { data: handicapRows }] = await Promise.all([
    supabase
      .from('scores')
      .select(
        'true_score, fs_applied, net_score, place, event_points, ' +
          'events!inner(name, event_type, sequence, seasons!inner(year))',
      )
      .eq('player_id', playerId),
    supabase
      .from('handicaps')
      .select('fs, seasons!inner(year)')
      .eq('player_id', playerId),
  ]);

  const rounds = ((scoreRows ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const ev = r.events as {
        name: string | null;
        event_type: EventType;
        sequence: number;
        seasons: { year: number } | { year: number }[];
      };
      return {
        year: Array.isArray(ev.seasons) ? ev.seasons[0].year : ev.seasons.year,
        eventType: ev.event_type,
        eventName: ev.name,
        sequence: ev.sequence,
        trueScore: num(r.true_score),
        fsApplied: num(r.fs_applied),
        netScore: num(r.net_score),
        place: num(r.place),
        eventPoints: num(r.event_points),
      };
    })
    .sort((a, b) => a.sequence - b.sequence);

  const handicapHistory = ((handicapRows ?? []) as unknown as Record<string, unknown>[])
    .map((r) => {
      const s = r.seasons as { year: number } | { year: number }[];
      return {
        year: Array.isArray(s) ? s[0].year : s.year,
        fs: round2(num(r.fs) ?? 0) as number,
      };
    })
    .sort((a, b) => a.year - b.year);

  const p = player as unknown as {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    first_year: number | null;
  };

  return {
    id: p.id,
    name: p.name,
    status: p.status,
    firstYear: p.first_year,
    rounds,
    handicapHistory,
  };
}

export async function getPlayers(leagueId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('players')
    .select('id, name, status, first_year')
    .eq('league_id', leagueId)
    .order('name');
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    first_year: number | null;
  }[];
}
