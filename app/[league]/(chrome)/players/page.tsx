import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague, getPlayers } from '@/lib/data/queries';
import { Badge, Card, Empty } from '@/components/ui';

export default async function PlayersPage({
  params,
}: {
  params: Promise<{ league: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const players = await getPlayers(league.id);
  const active = players.filter((p) => p.status === 'active');
  const inactive = players.filter((p) => p.status !== 'active');

  const list = (rows: typeof players) => (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((p) => (
        <li key={p.id}>
          <Link
            href={`/${slug}/players/${p.id}`}
            className="flex items-baseline justify-between rounded-lg border border-slate-200 px-3 py-2 hover:border-fairway-500 dark:border-slate-800"
          >
            <span>{p.name}</span>
            {p.first_year ? (
              <span className="text-xs text-slate-400">since {p.first_year}</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <Card title={`Active players (${active.length})`}>
        {active.length === 0 ? <Empty>Nobody active.</Empty> : list(active)}
      </Card>
      {inactive.length > 0 ? (
        <Card
          title={
            <span className="flex items-center gap-2">
              Past players <Badge>{inactive.length}</Badge>
            </span>
          }
        >
          {list(inactive)}
        </Card>
      ) : null}
    </div>
  );
}
