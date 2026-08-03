import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  championIdsOf,
  getEvents,
  getLeague,
  getSeasonScores,
  getSeasons,
  getStandings,
} from '@/lib/data/queries';
import { Card, Empty, fmt, toPar } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { InactiveToggle, NavSelect } from '@/components/selectors';
import { SortableTable, type SortableColumn, type SortableRow } from '@/components/sortable-table';
import type { ScoreRow } from '@/lib/data/queries';
import type { ReactNode } from 'react';

/**
 * Past seasons. The main Standings tab only ever shows the current season --
 * that's the common case -- so this is where "what happened in 2019" lives,
 * one season at a time via the year dropdown.
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
  const showInactive = showInactiveParam === '1';
  const league = await getLeague(slug);
  if (!league) notFound();

  const seasons = await getSeasons(league.id);
  const pastYears = seasons.filter((s) => !s.isCurrent).map((s) => s.year);
  if (pastYears.length === 0) {
    return <Empty>No past seasons yet — history shows up here once a season ends.</Empty>;
  }

  const year =
    yearParam && pastYears.includes(Number(yearParam)) ? Number(yearParam) : pastYears[0];

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
    { key: 'points', label: 'Points', align: 'right', sortable: true },
    { key: 'played', label: 'Played', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
  ];
  const standingsRows: SortableRow[] = visibleStandings.map((s) => ({
    key: s.playerId,
    sortValues: {
      rank: s.seasonRank,
      player: s.playerName,
      points: s.totalPoints,
      played: s.eventsPlayed,
      handicap: s.handicap,
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
            {championIds.has(s.playerId) ? (
              <span className="ml-1" title={`${year} Championship winner`}>
                🏆
              </span>
            ) : null}
            {s.playerStatus === 'inactive' ? (
              <span className="ml-1.5 align-middle text-[10px] text-slate-400">inactive</span>
            ) : null}
          </span>
        </Link>
      ),
      points: fmt(s.totalPoints),
      played: s.eventsPlayed,
      handicap: <span className="text-slate-400">{fmt(s.handicap)}</span>,
    },
  }));

  const gridColumns: SortableColumn[] = [
    { key: 'player', label: 'Player', sortable: true },
    ...played.map(
      (e): SortableColumn => ({
        key: e.id,
        label: (
          <Link href={`/${slug}/events?event=${e.id}`} className="hover:underline">
            {e.name ?? `#${e.legacyId ?? e.sequence}`}
            {e.eventType !== 'event' ? (
              <span className="block text-[10px] font-normal normal-case text-slate-400">
                {e.eventType}
              </span>
            ) : null}
          </Link>
        ),
        align: 'center',
        sortable: true,
      }),
    ),
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
      cells[e.id] = !s ? (
        <span className="text-slate-400">—</span>
      ) : (
        <span className={s.source === 'missed' || s.source === 'dnp' ? 'text-slate-400' : ''}>
          <span className="font-medium">{s.place ?? '—'}</span>
          <span className="ml-1 text-xs text-slate-400">
            {s.source === 'missed' || s.source === 'dnp' ? 'DNP' : toPar(s.netScore)}
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
            pastYears.map((y): [string, string] => [String(y), `/${slug}/history?year=${y}`]),
          )}
        />
        <InactiveToggle show={showInactive} />
      </div>

      <Card title={`${year} season standings`}>
        <p className="mb-3 text-xs text-slate-400">
          Lowest total wins — winning an event scores zero. Championships are excluded from
          points, but 🏆 marks that year&rsquo;s Championship winner, wherever they landed in the
          standings.
        </p>
        {visibleStandings.length === 0 ? (
          <Empty>No results recorded for {year}.</Empty>
        ) : (
          <SortableTable columns={standingsColumns} rows={standingsRows} />
        )}
      </Card>

      <Card title={`Every round in ${year}`}>
        <p className="mb-3 text-xs text-slate-400">
          Each cell shows finishing place, then net score. A dash means no round recorded.
        </p>
        {played.length === 0 || gridRows.length === 0 ? (
          <Empty>No events played that season.</Empty>
        ) : (
          <SortableTable columns={gridColumns} rows={gridRows} />
        )}
      </Card>
    </div>
  );
}
