import { createClient } from '@/lib/supabase/server';
import { computeStandings, NO_DROP, type DropRule } from '@/lib/domain/standings';
import { handicapBreakdown, projectHandicap } from '@/lib/domain/handicap';
import type { HandicapBreakdown } from '@/lib/domain/handicap';
import type { CareerRound } from '@/lib/domain/career';
import type {
  EventType,
  HandicapResult,
  HistoricalRound,
  ScoreSource,
  StandingRow,
} from '@/lib/domain/types';

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
  playerStatus: 'active' | 'inactive';
  playerPhotoUrl: string | null;
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

/**
 * Player IDs who won a season's Championship event -- 1st place in whichever
 * event has `eventType: 'championship'`, if it's been played.
 *
 * Deliberately independent of season points: the Championship is worth zero
 * points by design (see `points.ts`), so the points leader and the title
 * holder are often different people. Both are true at once; this is how the
 * app answers "who actually won it that year" rather than "who topped the
 * table." Dense ranking means a tie for 1st returns more than one ID.
 */
export function championIdsOf(
  events: LeagueEvent[],
  scores: ScoreRow[],
  decidedBy?: string | null,
): Set<string> {
  // A named winner settles it. A playoff decides who lifts the trophy
  // without moving a single score, so a season can finish level on the card
  // and still have exactly one champion -- and the trophy beside a name
  // should agree with the Hall of Champions rather than contradict it.
  if (decidedBy) return new Set([decidedBy]);

  const championshipEventIds = new Set(
    events.filter((e) => e.eventType === 'championship').map((e) => e.id),
  );
  return new Set(
    scores
      .filter((s) => championshipEventIds.has(s.eventId) && s.place === 1)
      .map((s) => s.playerId),
  );
}

/** The Championship winner an admin named for a season, if any. */
export async function getSeasonChampionId(
  leagueId: string,
  year: number,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('champion_player_id')
    .eq('league_id', leagueId)
    .eq('year', year)
    .maybeSingle();
  return (
    (data as { champion_player_id?: string | null } | null)?.champion_player_id ?? null
  );
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

export interface SeasonInfo {
  year: number;
  isCurrent: boolean;
}

/**
 * Every season of a league, newest first, with which one is current.
 *
 * "Current" is a real column (`seasons.is_current`) rather than "whichever
 * year is highest" -- a league can create next year's season early while this
 * year is still being played, and an admin needs a way to say which one the
 * app should open on. Falls back to the newest season if none is marked yet.
 */
export async function getSeasons(leagueId: string): Promise<SeasonInfo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('year, is_current')
    .eq('league_id', leagueId)
    .order('year', { ascending: false });
  const rows = ((data ?? []) as unknown as { year: number; is_current: boolean }[]).map(
    (r) => ({ year: r.year, isCurrent: r.is_current }),
  );
  if (rows.length > 0 && !rows.some((r) => r.isCurrent)) {
    rows[0].isCurrent = true;
  }
  return rows;
}

/** The current season's year, falling back to the newest season if unset. */
export function currentYearOf(seasons: SeasonInfo[]): number | null {
  return seasons.find((s) => s.isCurrent)?.year ?? seasons[0]?.year ?? null;
}

export async function getEvents(
  leagueId: string,
  year?: number,
): Promise<LeagueEvent[]> {
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
        'players!inner(name, status, photo_url), events!inner(seasons!inner(year))',
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
      const player = playerOf(r.players);
      return {
        id: r.id as string,
        eventId: r.event_id as string,
        playerId: r.player_id as string,
        playerName: player.name,
        playerStatus: player.status,
        playerPhotoUrl: player.photo_url,
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

/** Player fields as they arrive from a `players!inner(...)` embed, which
 *  PostgREST returns as an object for a to-one join but types as an array. */
function playerOf(value: unknown): {
  name: string;
  status: 'active' | 'inactive';
  photo_url: string | null;
} {
  const p = (Array.isArray(value) ? value[0] : value) as {
    name: string;
    status: 'active' | 'inactive';
    photo_url: string | null;
  };
  return p;
}

export interface StandingWithName extends StandingRow {
  playerName: string;
  playerStatus: 'active' | 'inactive';
  playerPhotoUrl: string | null;
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
/**
 * The season's drop rule, read from the season rather than the code.
 *
 * Seattle discards each player's worst finish; Iowa discards nothing. That
 * difference is data, so this looks it up instead of branching on which
 * chapter is being viewed -- and the rule can start in one season without
 * rewriting the ones before it. A missing row, or a count of zero, gives
 * NO_DROP and the arithmetic everyone has always had.
 */
async function getDropRule(leagueId: string, year: number): Promise<DropRule> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('seasons')
    .select('drop_worst_count')
    .eq('league_id', leagueId)
    .eq('year', year)
    .maybeSingle();

  const count = Number(
    (data as { drop_worst_count?: number } | null)?.drop_worst_count,
  );
  if (!Number.isFinite(count) || count <= 0) return NO_DROP;

  // Two results before the rule bites, so someone who has turned out once
  // cannot sit on an empty card at the top of the table.
  return { dropWorst: count, minResults: 2 };
}

export async function getStandings(
  leagueId: string,
  year: number,
): Promise<StandingWithName[]> {
  const [scores, events, handicaps, rule] = await Promise.all([
    getSeasonScores(leagueId, year),
    getEvents(leagueId, year),
    getHandicaps(leagueId, year),
    getDropRule(leagueId, year),
  ]);

  const countsTowardSeason = new Set(
    events.filter((e) => e.eventType !== 'championship').map((e) => e.id),
  );
  const eventById = new Map(events.map((e) => [e.id, e]));

  const ranked = computeStandings(
    scores
      .filter((s) => countsTowardSeason.has(s.eventId) && s.eventPoints !== null)
      .map((s) => {
        const event = eventById.get(s.eventId);
        return {
          playerId: s.playerId,
          eventPoints: s.eventPoints as number,
          eventId: s.eventId,
          sequence: event?.sequence,
          // Majors are spared by the rule.
          droppable: event?.eventType !== 'major',
        };
      }),
    rule,
  );

  const nameOf = new Map<string, string>(
    scores.map((s): [string, string] => [s.playerId, s.playerName]),
  );
  const statusOf = new Map<string, 'active' | 'inactive'>(
    scores.map((s): [string, 'active' | 'inactive'] => [s.playerId, s.playerStatus]),
  );
  const photoOf = new Map<string, string | null>(
    scores.map((s): [string, string | null] => [s.playerId, s.playerPhotoUrl]),
  );
  const fsOf = new Map<string, number>(
    handicaps.map((h): [string, number] => [h.playerId, h.fs]),
  );

  return ranked.map((r) => ({
    ...r,
    playerName: nameOf.get(r.playerId) ?? 'Unknown player',
    playerStatus: statusOf.get(r.playerId) ?? 'active',
    playerPhotoUrl: photoOf.get(r.playerId) ?? null,
    handicap: fsOf.get(r.playerId) ?? null,
  }));
}

export interface HandicapRow {
  playerId: string;
  playerName: string;
  status: 'active' | 'inactive';
  photoUrl: string | null;
  /** The locked figure actually in force this season. */
  fs: number;
  isOverride: boolean;
  /** What the rule would have produced. Present even for an override, so the
   *  screen can show how far a hand-set figure moved things. */
  computed: HandicapBreakdown | null;
  /** Same season last year, for movement. Null if there wasn't one. */
  priorFs: number | null;
  /** The rule applied to the season in progress: next year's figure if it
   *  stopped today. Null once the season is over and nothing is in progress. */
  projected: HandicapResult | null;
  projectedRounds: number;
}

/**
 * A season's locked handicaps, each with the full working behind it.
 *
 * The `handicaps` table stores only the final figure, so everything else here
 * is re-derived from the same prior-season scores and the same season rules
 * the lock used. That re-derivation is the point of the screen: a player
 * trusts a number they can see the arithmetic for, and an admin needs to see
 * how much an override moved it.
 *
 * Three seasons are in play at once and it is easy to conflate them. `year` is
 * the season whose handicaps are locked; `year - 1` is where the rounds that
 * produced them came from; and the season in progress feeds the projection for
 * `year + 1`. When you are viewing a past season, the projection is that
 * season's own successor, not today's.
 */
export async function getHandicaps(
  leagueId: string,
  year: number,
): Promise<HandicapRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('handicaps')
    .select(
      'fs, is_override, players!inner(id, name, status, photo_url), ' +
        'seasons!inner(year, handicap_best_of, handicap_window_events)',
    )
    .eq('league_id', leagueId);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const yearOfSeason = (value: unknown) => {
    const s = value as { year: number } | { year: number }[];
    return Array.isArray(s) ? s[0].year : s.year;
  };
  const filtered = rows.filter((r) => yearOfSeason(r.seasons) === year);
  if (filtered.length === 0) return [];

  const seasonOf = (value: unknown) => {
    const s = value as
      | { year: number; handicap_best_of: number; handicap_window_events: number }
      | { year: number; handicap_best_of: number; handicap_window_events: number }[];
    return Array.isArray(s) ? s[0] : s;
  };
  const season = seasonOf(filtered[0].seasons);
  const priorYear = year - 1;
  const bestOf = season.handicap_best_of;
  const windowEvents = season.handicap_window_events;

  // playerOf() below only returns name/status/photo_url; pull id separately.
  const idOf = (value: unknown) => {
    const p = value as { id: string } | { id: string }[];
    return Array.isArray(p) ? p[0].id : p.id;
  };
  const playerIds = filtered.map((r) => idOf(r.players));

  // Rounds are fetched for everyone, overrides included. An override still
  // needs its computed counterpart so the difference can be shown.
  const [{ data: scoreRows }, { data: priorHandicapRows }] = await Promise.all([
    supabase
      .from('scores')
      .select(
        'player_id, true_score, events!inner(name, event_type, sequence, seasons!inner(year))',
      )
      .eq('league_id', leagueId)
      .in('player_id', playerIds),
    supabase
      .from('handicaps')
      .select('fs, players!inner(id), seasons!inner(year)')
      .eq('league_id', leagueId)
      .in('player_id', playerIds),
  ]);

  // Two buckets per player: the season that fed this year's lock, and the one
  // in progress that will feed next year's.
  const sourceRounds = new Map<string, HistoricalRound[]>();
  const currentRounds = new Map<string, HistoricalRound[]>();
  for (const r of (scoreRows ?? []) as unknown as Record<string, unknown>[]) {
    const ev = r.events as {
      name: string | null;
      event_type: EventType;
      sequence: number;
      seasons: { year: number } | { year: number }[];
    };
    const y = yearOfSeason(ev.seasons);
    // Championship rounds never feed a handicap: they are played off a reduced
    // one, so recycling them would compound the reduction year over year.
    if (ev.event_type === 'championship' || r.true_score === null) continue;
    const bucket = y === priorYear ? sourceRounds : y === year ? currentRounds : null;
    if (!bucket) continue;
    const pid = r.player_id as string;
    const list = bucket.get(pid) ?? [];
    list.push({
      eventId: '',
      eventName: ev.name,
      eventType: ev.event_type,
      sequence: ev.sequence,
      trueScore: Number(r.true_score),
    });
    bucket.set(pid, list);
  }

  const priorFsByPlayer = new Map<string, number>();
  for (const r of (priorHandicapRows ?? []) as unknown as Record<string, unknown>[]) {
    if (yearOfSeason(r.seasons) !== priorYear) continue;
    priorFsByPlayer.set(idOf(r.players), Math.round(num(r.fs) ?? 0));
  }

  return filtered
    .map((r) => {
      const player = playerOf(r.players);
      const playerId = idOf(r.players);
      const source = sourceRounds.get(playerId) ?? [];
      const current = currentRounds.get(playerId) ?? [];

      return {
        playerId,
        playerName: player.name,
        status: player.status,
        photoUrl: player.photo_url,
        // Handicaps are whole strokes; round on every read so a value locked
        // before this was the rule doesn't keep showing a decimal.
        fs: Math.round(num(r.fs) ?? 0),
        isOverride: Boolean(r.is_override),
        computed: source.length
          ? handicapBreakdown(source, bestOf, windowEvents, priorYear)
          : null,
        priorFs: priorFsByPlayer.get(playerId) ?? null,
        projected: current.length
          ? projectHandicap(current, bestOf, windowEvents, year)
          : null,
        projectedRounds: current.length,
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
        'net_score, place, event_points, source, players!inner(name, status, photo_url)',
    )
    .eq('event_id', eventId);

  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  return rows
    .map((r) => {
      const player = playerOf(r.players);
      return {
        id: r.id as string,
        eventId: r.event_id as string,
        playerId: r.player_id as string,
        playerName: player.name,
        playerStatus: player.status,
        playerPhotoUrl: player.photo_url,
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

export interface ChapterCareer {
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  chapter: string | null;
  playerId: string;
  status: 'active' | 'inactive';
  firstYear: number | null;
  photoUrl: string | null;
  rounds: CareerRound[];
  handicapHistory: { year: number; fs: number }[];
}

export interface PlayerCareer {
  name: string;
  photoUrl: string | null;
  /** The chapter whose page this is, always first. */
  chapters: ChapterCareer[];
}

/** Names are matched across chapters case- and whitespace-insensitively,
 *  because the two sheets were maintained by different people. */
function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function mapRounds(rows: unknown[]): CareerRound[] {
  return (rows as Record<string, unknown>[])
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
    .sort((a, b) => a.year - b.year || a.sequence - b.sequence);
}

function mapHandicaps(rows: unknown[]): { year: number; fs: number }[] {
  return (rows as Record<string, unknown>[])
    .map((r) => {
      const s = r.seasons as { year: number } | { year: number }[];
      return {
        year: Array.isArray(s) ? s[0].year : s.year,
        // Handicaps are whole strokes; round on every read so a value locked
        // before that was the rule doesn't keep showing a decimal.
        fs: Math.round(num(r.fs) ?? 0),
      };
    })
    .sort((a, b) => a.year - b.year);
}

/**
 * A player's whole career, including any chapter they also played in.
 *
 * The five people who turn out for both AAGLA chapters have a deliberately
 * separate `players` row in each, because a handicap and a standing belong to
 * the chapter they were earned in. This does not merge those rows -- it reads
 * both and hands them back side by side, so the page can total the counting
 * stats while keeping the rate stats apart. Matching is on name, which is the
 * only thing the two chapters share; there is no cross-chapter identity in the
 * schema yet.
 *
 * Nothing here filters by permission. Row-level security decides which leagues
 * this client can see, so a sibling chapter the viewer has no access to simply
 * doesn't come back.
 */
export async function getPlayerCareer(
  leagueId: string,
  playerId: string,
): Promise<PlayerCareer | null> {
  const supabase = await createClient();

  const { data: player } = await supabase
    .from('players')
    .select('id, league_id, name, status, first_year, photo_url')
    .eq('league_id', leagueId)
    .eq('id', playerId)
    .maybeSingle();
  if (!player) return null;

  const self = player as unknown as {
    id: string;
    league_id: string;
    name: string;
    status: 'active' | 'inactive';
    first_year: number | null;
    photo_url: string | null;
  };

  // Every same-named row in any chapter, this one included. `ilike` without
  // wildcards is an exact but case-insensitive match; the trim/collapse below
  // catches the rest.
  const { data: twins } = await supabase
    .from('players')
    .select('id, league_id, name, status, first_year, photo_url')
    .ilike('name', self.name.trim());

  const siblings = (
    (twins ?? []) as unknown as {
      id: string;
      league_id: string;
      name: string;
      status: 'active' | 'inactive';
      first_year: number | null;
      photo_url: string | null;
    }[]
  ).filter((p) => normaliseName(p.name) === normaliseName(self.name));

  // Guard against a name collision inside one chapter: only ever take this
  // player from their own league, and one row per other league.
  const byLeague = new Map<string, (typeof siblings)[number]>();
  byLeague.set(self.league_id, self);
  for (const s of siblings) {
    if (s.league_id !== self.league_id && !byLeague.has(s.league_id)) {
      byLeague.set(s.league_id, s);
    }
  }

  const ids = [...byLeague.values()].map((p) => p.id);
  const leagueIds = [...byLeague.keys()];

  const [{ data: scoreRows }, { data: handicapRows }, { data: leagueRows }] =
    await Promise.all([
      supabase
        .from('scores')
        .select(
          'player_id, true_score, fs_applied, net_score, place, event_points, ' +
            'events!inner(name, event_type, sequence, seasons!inner(year))',
        )
        .in('player_id', ids),
      supabase
        .from('handicaps')
        .select('player_id, fs, seasons!inner(year)')
        .in('player_id', ids),
      supabase.from('leagues').select('id, slug, name, chapter').in('id', leagueIds),
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

  const allScores = (scoreRows ?? []) as unknown as Record<string, unknown>[];
  const allHandicaps = (handicapRows ?? []) as unknown as Record<string, unknown>[];

  const chapters: ChapterCareer[] = [];
  for (const p of byLeague.values()) {
    const league = leagues.get(p.league_id);
    // RLS hid the league, so there is nothing to label this chapter with.
    if (!league) continue;
    chapters.push({
      leagueId: p.league_id,
      leagueSlug: league.slug,
      leagueName: league.name,
      chapter: league.chapter,
      playerId: p.id,
      status: p.status,
      firstYear: p.first_year,
      photoUrl: p.photo_url,
      rounds: mapRounds(allScores.filter((r) => r.player_id === p.id)),
      handicapHistory: mapHandicaps(allHandicaps.filter((r) => r.player_id === p.id)),
    });
  }

  // The chapter whose page this is leads; any others follow by name.
  chapters.sort((a, b) => {
    if (a.leagueId === self.league_id) return -1;
    if (b.leagueId === self.league_id) return 1;
    return a.leagueName.localeCompare(b.leagueName);
  });

  if (chapters.length === 0) return null;

  return {
    name: self.name,
    photoUrl: chapters.find((c) => c.photoUrl)?.photoUrl ?? null,
    chapters,
  };
}

export async function getPlayers(leagueId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('players')
    .select('id, name, status, first_year, photo_url')
    .eq('league_id', leagueId)
    .order('name');
  return (data ?? []) as unknown as {
    id: string;
    name: string;
    status: 'active' | 'inactive';
    first_year: number | null;
    photo_url: string | null;
  }[];
}
