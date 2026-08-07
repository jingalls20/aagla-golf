import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentYearOf, getHandicaps, getLeague, getSeasons } from '@/lib/data/queries';
import { Badge, Card, Empty, fmt } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { InactiveToggle, NavSelect } from '@/components/selectors';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';
import { TableHint } from '@/components/table-hint';
import { resolveShowInactive } from '@/lib/prefs';

export default async function HandicapsPage({
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
  if (seasons.length === 0) return <Empty>No seasons yet.</Empty>;
  const years = seasons.map((s) => s.year);
  const year =
    yearParam && years.includes(Number(yearParam))
      ? Number(yearParam)
      : (currentYearOf(seasons) as number);
  const allHandicaps = await getHandicaps(league.id, year);
  const handicaps = showInactive
    ? allHandicaps
    : allHandicaps.filter((h) => h.status === 'active');

  const columns: SortableColumn[] = [
    { key: 'player', label: 'Player', sortable: true },
    { key: 'fs', label: 'Free strokes', align: 'right', sortable: true },
    { key: 'events', label: 'Events used' },
  ];

  const rows: SortableRow[] = handicaps.map((h) => ({
    key: h.playerId,
    sortValues: { player: h.playerName, fs: h.fs },
    cells: {
      player: (
        <Link
          href={`/${slug}/players/${h.playerId}`}
          className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
        >
          <Avatar name={h.playerName} photoUrl={h.photoUrl} />
          <span>{h.playerName}</span>
          {h.status === 'inactive' ? <Badge>inactive</Badge> : null}
        </Link>
      ),
      fs: <span className="font-medium">{fmt(h.fs)}</span>,
      events: h.isOverride ? (
        <Badge tone="amber">set by an admin</Badge>
      ) : h.roundsUsed.length === 0 ? (
        <span className="text-slate-400">no {year - 1} rounds recorded</span>
      ) : (
        <span className="text-slate-400">
          {h.roundsUsed.map((r) => r.eventName ?? 'unnamed event').join(', ')}
        </span>
      ),
    },
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NavSelect
          label="Season"
          value={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          hrefs={Object.fromEntries(
            years.map((y): [string, string] => [
              String(y),
              `/${slug}/handicaps?year=${y}`,
            ]),
          )}
        />
        <InactiveToggle show={showInactive} />
      </div>

      <Card title={`${year} handicaps`}>
        <TableHint>
          Locked for the season: the average of a player&rsquo;s best 3 true scores from
          their last 7 Event or Major rounds of the previous year, rounded to the
          nearest whole stroke. A negative figure means the player gives strokes back.
        </TableHint>
        {handicaps.length === 0 ? (
          <Empty>No handicaps locked for {year} yet.</Empty>
        ) : (
          <SortableTable columns={columns} rows={rows} />
        )}
      </Card>
    </div>
  );
}
