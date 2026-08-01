import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHandicaps, getLeague, getSeasonYears } from '@/lib/data/queries';
import { Badge, Card, Empty, TableWrap, Td, Th, YearTabs, fmt } from '@/components/ui';

export default async function HandicapsPage({
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
  const handicaps = await getHandicaps(league.id, year);

  return (
    <div className="space-y-6">
      <YearTabs years={years} current={year} hrefFor={(y) => `/${slug}/handicaps?year=${y}`} />

      <Card title={`${year} handicaps`}>
        <p className="mb-3 text-xs text-slate-400">
          Locked for the season: the average of a player&rsquo;s best 3 true scores from their
          last 7 Event or Major rounds of the previous year. A negative figure means the
          player gives strokes back.
        </p>
        {handicaps.length === 0 ? (
          <Empty>No handicaps locked for {year} yet.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th align="right">Free strokes</Th>
                <Th>How it was worked out</Th>
              </tr>
            </thead>
            <tbody>
              {handicaps.map((h) => (
                <tr key={h.playerId}>
                  <Td>
                    <Link
                      href={`/${slug}/players/${h.playerId}`}
                      className="hover:text-fairway-600 hover:underline"
                    >
                      {h.playerName}
                    </Link>
                    {h.status === 'inactive' ? (
                      <span className="ml-2">
                        <Badge>inactive</Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right">
                    <span className="font-medium">{fmt(h.fs, 2)}</span>
                  </Td>
                  <Td muted>
                    {h.isOverride ? <Badge tone="amber">set by an admin</Badge> : h.note ?? '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
