import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getEvents,
  getLeague,
  getSeasonScores,
  getSeasonYears,
  getStandings,
} from '@/lib/data/queries';
import { Card, Empty, TableWrap, Td, Th, YearTabs, fmt, toPar } from '@/components/ui';

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { league: slug } = await params;
  const { year: yearParam } = await searchParams;
  const league = await getLeague(slug);
  if (!league) notFound();

  const years = await getSeasonYears(league.id);
  if (years.length === 0) return <Empty>No seasons yet.</Empty>;

  const year = yearParam && years.includes(Number(yearParam)) ? Number(yearParam) : years[0];
  const [standings, events, scores] = await Promise.all([
    getStandings(league.id, year),
    getEvents(league.id, year),
    getSeasonScores(league.id, year),
  ]);

  // Player × event grid. Only events that have results get a column.
  const played = events.filter((e) => scores.some((s) => s.eventId === e.id));
  const cell = new Map<string, (typeof scores)[number]>();
  const nameByPlayer = new Map<string, string>();
  for (const s of scores) {
    cell.set(`${s.playerId}:${s.eventId}`, s);
    nameByPlayer.set(s.playerId, s.playerName);
  }
  const rowPlayers = [...nameByPlayer.entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  );

  return (
    <div className="space-y-6">
      <YearTabs years={years} current={year} hrefFor={(y) => `/${slug}?year=${y}`} />

      <Card title={`${year} season standings`}>
        <p className="mb-3 text-xs text-slate-400">
          Lowest total wins — winning an event scores zero. Championships are excluded.
        </p>
        {standings.length === 0 ? (
          <Empty>No results recorded for {year} yet.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Player</Th>
                <Th align="right">Points</Th>
                <Th align="right">Played</Th>
                <Th align="right">Handicap</Th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.playerId}>
                  <Td>{s.seasonRank}</Td>
                  <Td>
                    <Link
                      href={`/${slug}/players/${s.playerId}`}
                      className="hover:text-fairway-600 hover:underline"
                    >
                      {s.playerName}
                    </Link>
                  </Td>
                  <Td align="right">{fmt(s.totalPoints)}</Td>
                  <Td align="right">{s.eventsPlayed}</Td>
                  <Td align="right" muted>
                    {fmt(s.handicap)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Every round this season">
        <p className="mb-3 text-xs text-slate-400">
          Each cell shows finishing place, then net score. A dash means no round recorded.
        </p>
        {played.length === 0 ? (
          <Empty>No events played yet.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Player</Th>
                {played.map((e) => (
                  <Th key={e.id} align="center">
                    <Link href={`/${slug}/events?event=${e.id}`} className="hover:underline">
                      {e.name ?? `#${e.legacyId ?? e.sequence}`}
                      {e.eventType !== 'event' ? (
                        <span className="block text-[10px] font-normal normal-case text-slate-400">
                          {e.eventType}
                        </span>
                      ) : null}
                    </Link>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowPlayers.map(([playerId, name]) => (
                <tr key={playerId}>
                  <Td>
                    <Link
                      href={`/${slug}/players/${playerId}`}
                      className="hover:text-fairway-600 hover:underline"
                    >
                      {name}
                    </Link>
                  </Td>
                  {played.map((e) => {
                    const s = cell.get(`${playerId}:${e.id}`);
                    if (!s) return <Td key={e.id} align="center" muted>—</Td>;
                    return (
                      <Td key={e.id} align="center" muted={s.source === 'missed'}>
                        <span className="font-medium">{s.place ?? '—'}</span>
                        <span className="ml-1 text-xs text-slate-400">
                          {s.source === 'missed' ? 'DNP' : toPar(s.netScore)}
                        </span>
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
