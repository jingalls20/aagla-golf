import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  championIdsOf,
  currentYearOf,
  getEvents,
  getLeague,
  getSeasonScores,
  getSeasons,
  getStandings,
} from '@/lib/data/queries';
import { Card, Empty, fmt, toPar } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { InactiveToggle, NavSelect } from '@/components/selectors';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';
import { TableHint } from '@/components/table-hint';
import { championshipHandicap } from '@/lib/domain/handicap';
import { resolveShowInactive } from '@/lib/prefs';
import type { ScoreRow } from '@/lib/data/queries';
import type { ReactNode } from 'react';

/**
 * Past seasons. The main Standings tab only ever shows the current season --
 * that's the common case -- so this is where "what happened in 2019" lives,
 * one season at a time via the year dropdown. Same table shape as the
 * Standings tab (Event Points, handicap in parentheses, Championship start,
 * a 3-number event grid) so the two never disagree about what a column means.
 */
export default async function HistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ year?: string; showInactive?: string }>;
}) {
  const { league: slug } = await params;
  const { year: yearParam, showInactive: showInactiveParam } = await searchParams;
  const showInactive = await resolveShowInactive(showInactiveParam);
  const league = await getLeague(slug);
  if (!league) notFound();

  const seasons = await getSeasons(league.id);
  // A season is "past" once a more recent year exists -- not merely
  // "not current". A season built ahead of time (see admin/seasons) isn't
  // current either, but it hasn't happened yet, so it doesn't belong here.
  const currentYear = currentYearOf(seasons);
  const pastYears = seasons
    .filter((s) => !s.isCurrent && (currentYear === null || s.year < currentYear))
    .map((s) => s.year);
  if (pastYears.length === 0) {
    return (
      <Empty>No past seasons yet — history shows up here once a season ends.</Empty>
    );
  }

  const year =
    yearParam && pastYears.includes(Number(yearParam))
      ? Number(yearParam)
      : pastYears[0];

  const [standings, events, scores] = await Promise.all([
    getStandings(league.id, year),
    getEvents(league.id, year),
    getSeasonScores(league.id, year),
  ]);

  const visibleStandings = showInactive
    ? standings
    : standings.filter((s) => s.playerStatus === 'active');

  const championIds = championIdsOf(events, scores);

  const played = events.filter((e) => scores.some((s) => s.eventId === e.id));
  const cell = new Map<string, ScoreRow>();
  const playerMeta = new Map<
    string,
    { name: string; status: 'active' | 'inactive'; photoUrl: string | null }
  >();
  for (const s of scores) {
    cell.set(`${s.playerId}:${s.eventId}`, s);
    playerMeta.set(s.playerId, {
      name: s.playerName,
      status: s.playerStatus,
      photoUrl: s.playerPhotoUrl,
    });
  }
  const allRowPlayers = [...playerMeta.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name),
  );
  const rowPlayers = showInactive
    ? allRowPlayers
    : allRowPlayers.filter(([, meta]) => meta.status === 'active');

  const standingsColumns: SortableColumn[] = [
    { key: 'rank', label: '#', align: 'right', sortable: true },
    { key: 'player', label: 'Player', sortable: true },
    { key: 'points', label: 'Event Points', align: 'right', sortable: true },
    { key: 'played', label: 'Events Played', align: 'right', sortable: true },
    {
      key: 'championshipStart',
      label: 'Championship start',
      align: 'right',
      sortable: true,
    },
  ];
  const standingsRows: SortableRow[] = visibleStandings.map((s) => {
    // Same rule as the current-season Standings tab: what this player would
    // have started the Championship on, based on where the season actually
    // finished. See the identical computation on the dashboard for the full
    // explanation of the sign convention.
    const championshipStart = -championshipHandicap(s.handicap ?? 0, s.seasonRank);
    return {
      key: s.playerId,
      sortValues: {
        rank: s.seasonRank,
        player: s.playerName,
        points: s.totalPoints,
        played: s.eventsPlayed,
        championshipStart,
      },
      cells: {
        rank: s.seasonRank,
        player: (
          <Link
            href={`/${slug}/players/${s.playerId}`}
            className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
          >
            <Avatar name={s.playerName} photoUrl={s.playerPhotoUrl} />
            <span>
              {s.playerName}
              {s.handicap !== null ? (
                <span className="ml-1 text-slate-400">({fmt(s.handicap)})</span>
              ) : null}
              {championIds.has(s.playerId) ? (
                <span className="ml-1" title={`${year} Championship winner`}>
                  🏆
                </span>
              ) : null}
              {s.playerStatus === 'inactive' ? (
                <span className="ml-1.5 align-middle text-[10px] text-slate-400">
                  inactive
                </span>
              ) : null}
            </span>
          </Link>
        ),
        points: fmt(s.totalPoints),
        played: s.eventsPlayed,
        championshipStart: (
          <span className="text-slate-400">{toPar(championshipStart)}</span>
        ),
      },
    };
  });

  const gridColumns: SortableColumn[] = [
    { key: 'player', label: 'Player', sortable: true },
    ...played.map((e): SortableColumn => ({
      key: e.id,
      // Plain text, not a link -- same reasoning as the dashboard's event
      // grid: this header doubles as the sort control, and a nested <a>
      // would hijack the click into a navigation instead of a sort.
      label: (
        <span>
          {e.name ?? `#${e.legacyId ?? e.sequence}`}
          {e.eventType !== 'event' ? (
            <span className="block text-[10px] font-normal normal-case text-slate-400">
              {e.eventType}
            </span>
          ) : null}
        </span>
      ),
      align: 'center',
      sortable: true,
    })),
  ];
  const gridRows: SortableRow[] = rowPlayers.map(([playerId, meta]) => {
    const cells: Record<string, ReactNode> = {
      player: (
        <Link
          href={`/${slug}/players/${playerId}`}
          className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
        >
          <Avatar name={meta.name} photoUrl={meta.photoUrl} />
          <span>
            {meta.name}
            {championIds.has(playerId) ? (
              <span className="ml-1" title={`${year} Championship winner`}>
                🏆
              </span>
            ) : null}
          </span>
        </Link>
      ),
    };
    const sortValues: Record<string, string | number | null> = { player: meta.name };
    for (const e of played) {
      const s = cell.get(`${playerId}:${e.id}`);
      const dnp = s?.source === 'missed' || s?.source === 'dnp';
      cells[e.id] = !s ? (
        <span className="text-slate-400">—</span>
      ) : (
        <span className={dnp ? 'text-slate-400' : ''}>
          <span className="font-medium">{s.place ?? '—'}</span>
          <span className="ml-1 text-[10px] leading-tight text-slate-400">
            {dnp ? 'DNP' : toPar(s.netScore)} &middot; {fmt(s.eventPoints)}pts
          </span>
        </span>
      );
      sortValues[e.id] = s?.netScore ?? null;
    }
    return { key: playerId, cells, sortValues };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NavSelect
          label="Season"
          value={String(year)}
          options={pastYears.map((y) => ({ value: String(y), label: String(y) }))}
          hrefs={Object.fromEntries(
            pastYears.map((y): [string, string] => [
              String(y),
              `/${slug}/history?year=${y}`,
            ]),
          )}
        />
        <InactiveToggle show={showInactive} />
      </div>

      <Card title={`${year} season standings`}>
        <TableHint>
          Lowest total wins — winning an event scores zero. A player&rsquo;s handicap is
          shown in parentheses next to their name. <strong>Championship start</strong>{' '}
          is where they began the Championship round relative to par, based on how the
          season actually finished. Like a net score, a big handicap starts well under
          par, and a small or negative one can start over. Championships are excluded
          from Event Points, but 🏆 marks that year&rsquo;s Championship winner,
          wherever they landed in the standings.
        </TableHint>
        {visibleStandings.length === 0 ? (
          <Empty>No results recorded for {year}.</Empty>
        ) : (
          <SortableTable columns={standingsColumns} rows={standingsRows} sticky />
        )}
      </Card>

      <Card title={`Every round in ${year}`}>
        <TableHint>
          Each cell shows finishing place; below it, net score relative to par and event
          points earned. A dash means no round recorded. Click a column header to sort
          by that event.
        </TableHint>
        {played.length === 0 || gridRows.length === 0 ? (
          <Empty>No events played that season.</Empty>
        ) : (
          <SortableTable columns={gridColumns} rows={gridRows} sticky />
        )}
      </Card>
    </div>
  );
}
