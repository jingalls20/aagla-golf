import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventResults, getEvents, getLeague } from '@/lib/data/queries';
import { Badge, Card, Empty, fmt, toPar } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { NavSelect } from '@/components/selectors';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ event?: string; year?: string }>;
}) {
  const { league: slug } = await params;
  const { event: eventParam, year: yearParam } = await searchParams;
  const league = await getLeague(slug);
  if (!league) notFound();

  const allEvents = (await getEvents(league.id)).sort(
    (a, b) => b.year - a.year || b.sequence - a.sequence,
  );
  if (allEvents.length === 0) return <Empty>No events yet.</Empty>;

  const years = [...new Set(allEvents.map((e) => e.year))].sort((a, b) => b - a);

  // Default to the most recent event that actually has results, then let the
  // year and event dropdowns narrow from there.
  const defaultEvent =
    allEvents.find((e) => e.id === eventParam) ??
    allEvents.find((e) => e.status === 'played') ??
    allEvents[0];
  const year =
    yearParam && years.includes(Number(yearParam))
      ? Number(yearParam)
      : defaultEvent.year;

  const eventsInYear = allEvents.filter((e) => e.year === year);
  const selected =
    eventsInYear.find((e) => e.id === eventParam) ??
    eventsInYear.find((e) => e.status === 'played') ??
    eventsInYear[0];

  const results = await getEventResults(selected.id);

  const columns: SortableColumn[] = [
    { key: 'place', label: 'Place', align: 'right', sortable: true },
    { key: 'player', label: 'Player', sortable: true },
    { key: 'score', label: 'Score', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
    { key: 'diff', label: 'Course diff.', align: 'right', sortable: true },
    { key: 'net', label: 'Net', align: 'right', sortable: true },
    { key: 'points', label: 'Points', align: 'right', sortable: true },
  ];

  const rows: SortableRow[] = results.map((r) => ({
    key: r.id,
    sortValues: {
      place: r.place,
      player: r.playerName,
      score: r.trueScore,
      handicap: r.fsApplied,
      diff: r.courseDifferential,
      net: r.netScore,
      points: r.eventPoints,
    },
    cells: {
      place: r.place ?? '—',
      player: (
        <Link
          href={`/${slug}/players/${r.playerId}`}
          className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
        >
          <Avatar name={r.playerName} photoUrl={r.playerPhotoUrl} />
          <span>{r.playerName}</span>
          {r.source === 'missed' || r.source === 'dnp' ? (
            <Badge>did not play</Badge>
          ) : null}
        </Link>
      ),
      score: toPar(r.trueScore),
      handicap: <span className="text-slate-400">{fmt(r.fsApplied)}</span>,
      diff: (
        <span className="text-slate-400">
          {r.courseDifferential === 0 ? '—' : fmt(r.courseDifferential)}
        </span>
      ),
      net: toPar(r.netScore),
      points: fmt(r.eventPoints),
    },
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <NavSelect
          label="Season"
          value={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          hrefs={Object.fromEntries(
            years.map((y): [string, string] => [
              String(y),
              `/${slug}/events?year=${y}`,
            ]),
          )}
        />
        <NavSelect
          label="Event"
          value={selected.id}
          options={eventsInYear.map((e) => ({
            value: e.id,
            label: e.name ?? `Event #${e.legacyId ?? e.sequence}`,
          }))}
          hrefs={Object.fromEntries(
            eventsInYear.map((e): [string, string] => [
              e.id,
              `/${slug}/events?year=${year}&event=${e.id}`,
            ]),
          )}
        />
      </div>

      <Card
        title={
          <span className="flex flex-wrap items-center gap-2">
            {selected.name ?? `Event #${selected.legacyId ?? selected.sequence}`}
            <Badge tone={selected.eventType === 'championship' ? 'amber' : 'slate'}>
              {selected.eventType}
            </Badge>
            <Badge tone={selected.status === 'played' ? 'green' : 'slate'}>
              {selected.status}
            </Badge>
            <span className="text-slate-400">{selected.year}</span>
          </span>
        }
      >
        {selected.eventType === 'championship' ? (
          <p className="mb-3 text-xs text-slate-400">
            Championship results are worth no season points, by design.
          </p>
        ) : null}
        {results.length === 0 ? (
          <Empty>No scores recorded for this event yet.</Empty>
        ) : (
          <SortableTable columns={columns} rows={rows} sticky />
        )}
      </Card>
    </div>
  );
}
