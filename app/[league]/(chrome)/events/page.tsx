import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventResults, getEvents, getLeague } from '@/lib/data/queries';
import { Badge, Card, Empty, TableWrap, Td, Th, fmt, toPar } from '@/components/ui';

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { league: slug } = await params;
  const { event: eventParam } = await searchParams;
  const league = await getLeague(slug);
  if (!league) notFound();

  const events = (await getEvents(league.id)).sort(
    (a, b) => b.year - a.year || b.sequence - a.sequence,
  );
  if (events.length === 0) return <Empty>No events yet.</Empty>;

  // Default to the most recent event that actually has results.
  const selected = events.find((e) => e.id === eventParam) ?? events.find((e) => e.status === 'played') ?? events[0];
  const results = await getEventResults(selected.id);

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <nav className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/${slug}/events?event=${e.id}`}
            className={`block rounded-md px-2.5 py-1.5 text-sm ${
              e.id === selected.id
                ? 'bg-fairway-500 font-medium text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className="mr-1.5 text-xs opacity-70">{e.year}</span>
            {e.name ?? `Event #${e.legacyId ?? e.sequence}`}
          </Link>
        ))}
      </nav>

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
          <TableWrap>
            <thead>
              <tr>
                <Th align="right">Place</Th>
                <Th>Player</Th>
                <Th align="right">Score</Th>
                <Th align="right">Handicap</Th>
                <Th align="right">Course diff.</Th>
                <Th align="right">Net</Th>
                <Th align="right">Points</Th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <Td align="right">{r.place ?? '—'}</Td>
                  <Td>
                    <Link
                      href={`/${slug}/players/${r.playerId}`}
                      className="hover:text-fairway-600 hover:underline"
                    >
                      {r.playerName}
                    </Link>
                    {r.source === 'missed' ? (
                      <span className="ml-2">
                        <Badge>did not play</Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right">{toPar(r.trueScore)}</Td>
                  <Td align="right" muted>{fmt(r.fsApplied)}</Td>
                  <Td align="right" muted>
                    {r.courseDifferential === 0 ? '—' : fmt(r.courseDifferential)}
                  </Td>
                  <Td align="right">{toPar(r.netScore)}</Td>
                  <Td align="right">{fmt(r.eventPoints)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
