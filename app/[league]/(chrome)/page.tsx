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
import { InactiveToggle } from '@/components/selectors';
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

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ showInactive?: string }>;
}) {
  const { league: slug } = await params;
  const { showInactive: showInactiveParam } = await searchParams;
  const showInactive = await resolveShowInactive(showInactiveParam);
  const league = await getLeague(slug);
  if (!league) notFound();

  const seasons = await getSeasons(league.id);
  const year = currentYearOf(seasons);
  if (year === null) return <Empty>No seasons yet.</Empty>;

  const [standings, events, scores] = await Promise.all([
    getStandings(league.id, year),
    getEvents(league.id, year),
    getSeasonScores(league.id, year),
  ]);

  const visibleStandings = showInactive
    ? standings
    : standings.filter((s) => s.playerStatus === 'active');

  const championIds = championIdsOf(events, scores);

  // Player × event grid. Every event in the season gets a column, played or
  // not -- an admin scanning the season wants to see what's still ahead, not
  // just what's already in the books.
  const seasonEvents = events;
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
      // The figure moves with the standings, so it is a projection rather
      // than a fact until the Championship is actually played. This screen
      // only ever shows the current season, so the caveat is always true
      // here -- the History tab, which shows finished seasons, says nothing
      // of the sort.
      label: (
        <span className="inline-block leading-tight">
          Championship start
          <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
            if the season ended today
          </span>
        </span>
      ),
      align: 'right',
      sortable: true,
    },
  ];
  const standingsRows: SortableRow[] = visibleStandings.map((s) => {
    // What this player would start the Championship round on if the season
    // ended today: the season leader plays their full handicap, and every
    // place after that gives up one more stroke -- same rule the
    // Championship event itself applies (see championshipHandicap). That
    // function returns strokes in the same sign as a season handicap (higher
    // is a bigger advantage); a "starting score" reads the opposite way --
    // strokes already on the board before teeing off -- so it's shown
    // negated, and same as any relative-to-par figure, is free to land on
    // either side of zero: a big handicap starts well under (e.g. "-13"), a
    // player who already gives strokes back can end up starting over
    // (e.g. "+4") once the stagger takes more from them.
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
    ...seasonEvents.map((e): SortableColumn => ({
      key: e.id,
      // Plain text, not a link -- this header doubles as the sort control,
      // and a nested <a> would hijack the click into a navigation instead
      // of a sort. The event's own page is still reachable from its rows
      // elsewhere (Events tab), just not from this column header.
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
    for (const e of seasonEvents) {
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
        <p className="text-sm text-slate-400">
          Current season{' '}
          <span className="font-medium text-slate-600 dark:text-slate-300">{year}</span>
        </p>
        <InactiveToggle show={showInactive} />
      </div>

      <Card title={`${year} season standings`}>
        <TableHint>
          Lowest total wins — winning an event scores zero. A player&rsquo;s handicap is
          shown in parentheses next to their name. <strong>Championship start</strong>{' '}
          is where they&rsquo;d begin the Championship round relative to par if the
          season ended today: the leader keeps their full handicap, and every place
          after that gives up one more stroke. Like a net score, a big handicap starts
          well under par, and a small or negative one can start over. Championships are
          excluded from Event Points, but 🏆 marks that year&rsquo;s Championship
          winner, wherever they landed in the standings.
        </TableHint>
        {visibleStandings.length === 0 ? (
          <Empty>No results recorded for {year} yet.</Empty>
        ) : (
          <SortableTable columns={standingsColumns} rows={standingsRows} />
        )}
      </Card>

      <Card title={`${year} events`}>
        <TableHint>
          Every event in the season, played or not. The big number is finishing place;
          below it, net score relative to par and event points earned. A dash means that
          round hasn&rsquo;t been recorded yet. Click a column header to sort by that
          event.
        </TableHint>
        {seasonEvents.length === 0 ? (
          <Empty>No events scheduled for {year} yet.</Empty>
        ) : gridRows.length === 0 ? (
          <Empty>No scores recorded for {year} yet.</Empty>
        ) : (
          <SortableTable columns={gridColumns} rows={gridRows} />
        )}
      </Card>
    </div>
  );
}
