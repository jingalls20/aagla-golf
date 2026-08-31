import { createClient } from '@/lib/supabase/server';
import type { EventType } from '@/lib/domain/types';

/**
 * Admin-facing season and event reads for the "build a season" screens.
 * Separate from `queries.ts` (the public read screens, which only need a
 * season's year and whether it's current) because these carry the ids and
 * raw rule fields an admin mutation needs.
 */

export interface SeasonAdminRow {
  id: string;
  year: number;
  isCurrent: boolean;
  handicapBestOf: number;
  handicapWindowEvents: number;
  status: 'open' | 'closed';
  /** Championship winner named by an admin, where the scores cannot say. */
  championPlayerId: string | null;
}

export async function getSeasonsAdmin(leagueId: string): Promise<SeasonAdminRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select(
      'id, year, is_current, handicap_best_of, handicap_window_events, status, ' +
        'champion_player_id',
    )
    .eq('league_id', leagueId)
    .order('year', { ascending: false });
  return (
    (data ?? []) as unknown as {
      id: string;
      year: number;
      is_current: boolean;
      handicap_best_of: number;
      handicap_window_events: number;
      status: 'open' | 'closed';
      champion_player_id: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    year: r.year,
    isCurrent: r.is_current,
    handicapBestOf: r.handicap_best_of,
    handicapWindowEvents: r.handicap_window_events,
    status: r.status,
    championPlayerId: r.champion_player_id,
  }));
}

export interface EventAdminRow {
  id: string;
  sequence: number;
  eventType: EventType;
  name: string | null;
  eventDate: string | null;
  course: string | null;
  status: 'scheduled' | 'played' | 'cancelled';
}

export async function getEventsForSeason(seasonId: string): Promise<EventAdminRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('id, sequence, event_type, name, event_date, course, status')
    .eq('season_id', seasonId)
    .order('sequence', { ascending: true });
  return (
    (data ?? []) as unknown as {
      id: string;
      sequence: number;
      event_type: EventType;
      name: string | null;
      event_date: string | null;
      course: string | null;
      status: 'scheduled' | 'played' | 'cancelled';
    }[]
  ).map((r) => ({
    id: r.id,
    sequence: r.sequence,
    eventType: r.event_type,
    name: r.name,
    eventDate: r.event_date,
    course: r.course,
    status: r.status,
  }));
}
