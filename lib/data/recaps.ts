import { createClient } from '@/lib/supabase/server';
import {
  championIdsOf,
  getEvents,
  getEventResults,
  getSeasonScores,
  getStandings,
} from '@/lib/data/queries';
import {
  eventLabel,
  type EventRecapInput,
  type SeasonRecapInput,
} from '@/lib/domain/recap';

/**
 * Assembling the inputs a recap is written from.
 *
 * Separate from the action that posts it for one reason that matters: the
 * text is always rebuilt here, from the database, at the moment of posting.
 * The admin screen shows a preview, but that preview is never what gets
 * sent -- the form submits an event id, not a paragraph. Otherwise the
 * "post" button would be an arbitrary-message-to-Discord button for anyone
 * able to forge a request, and a preview that went stale between rendering
 * and clicking would publish a result that had since been corrected.
 */

export async function eventRecapInput(
  leagueId: string,
  leagueName: string,
  eventId: string,
): Promise<EventRecapInput | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('events')
    .select('id, league_id, sequence, event_type, name, course, seasons!inner(year)')
    .eq('id', eventId)
    .maybeSingle();

  if (!data) return null;
  const row = data as unknown as {
    league_id: string;
    sequence: number;
    event_type: EventRecapInput['eventType'];
    name: string | null;
    course: string | null;
    seasons: { year: number } | { year: number }[];
  };

  // The event has to belong to the league the caller is an admin of. RLS
  // would refuse the read anyway, but an explicit check keeps a chapter's
  // results from being posted to another chapter's channel by id-guessing.
  if (row.league_id !== leagueId) return null;

  const rounds = await getEventResults(eventId);

  return {
    leagueName,
    year: Array.isArray(row.seasons) ? row.seasons[0].year : row.seasons.year,
    eventType: row.event_type,
    eventName: row.name,
    course: row.course,
    sequence: row.sequence,
    rounds: rounds.map((s) => ({
      playerName: s.playerName,
      trueScore: s.trueScore,
      netScore: s.netScore,
      place: s.place,
      eventPoints: s.eventPoints,
      fsApplied: s.fsApplied,
    })),
  };
}

export async function seasonRecapInput(
  leagueId: string,
  leagueName: string,
  year: number,
): Promise<SeasonRecapInput> {
  const [standings, events, scores] = await Promise.all([
    getStandings(leagueId, year),
    getEvents(leagueId, year),
    getSeasonScores(leagueId, year),
  ]);

  // Cancelled events are not part of the season's shape; counting them in
  // the denominator would leave a finished season reading "6 of 7" forever.
  const live = events.filter((e) => e.status !== 'cancelled');
  const labelOf = new Map(
    live.map((e) => [
      e.id,
      eventLabel({
        eventName: e.name,
        // getEvents doesn't carry course; the name is the better label here
        // anyway, and falls back to the event number when there isn't one.
        course: null,
        sequence: e.sequence,
        eventType: e.eventType,
      }),
    ]),
  );

  const champions = championIdsOf(events, scores);
  const championName =
    scores.find((s) => champions.has(s.playerId))?.playerName ?? null;

  return {
    leagueName,
    year,
    standings: standings.map((s) => ({
      playerName: s.playerName,
      totalPoints: s.totalPoints,
      eventsPlayed: s.eventsPlayed,
      seasonRank: s.seasonRank,
    })),
    eventsPlayed: live.filter((e) => e.status === 'played').length,
    eventsScheduled: live.length,
    championName,
    rounds: scores.map((s) => ({
      playerName: s.playerName,
      trueScore: s.trueScore,
      netScore: s.netScore,
      place: s.place,
      eventPoints: s.eventPoints,
      fsApplied: s.fsApplied,
      eventLabel: labelOf.get(s.eventId) ?? 'an event',
    })),
  };
}
