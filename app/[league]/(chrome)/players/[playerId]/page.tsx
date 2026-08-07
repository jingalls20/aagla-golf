import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague, getPlayerProfile } from '@/lib/data/queries';
import { LineChart } from '@/components/chart';
import { Avatar } from '@/components/avatar';
import { Badge, Card, Empty, fmt, toPar } from '@/components/ui';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ league: string; playerId: string }>;
}) {
  const { league: slug, playerId } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const profile = await getPlayerProfile(league.id, playerId);
  if (!profile) notFound();

  const played = profile.rounds.filter((r) => r.trueScore !== null);
  const nets = played.map((r) => r.netScore).filter((n): n is number => n !== null);
  const nonChamp = played.filter((r) => r.eventType !== 'championship');

  const wins = played.filter((r) => r.place === 1).length;
  const podiums = played.filter((r) => r.place !== null && r.place <= 3).length;
  const champWins = played.filter(
    (r) => r.eventType === 'championship' && r.place === 1,
  ).length;
  const avg = (xs: number[]) =>
    xs.length
      ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100
      : null;

  const recordColumns: SortableColumn[] = [
    { key: 'year', label: 'Year', align: 'right', sortable: true },
    { key: 'event', label: 'Event', sortable: true },
    { key: 'score', label: 'Score', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
    { key: 'net', label: 'Net', align: 'right', sortable: true },
    { key: 'place', label: 'Place', align: 'right', sortable: true },
    { key: 'points', label: 'Points', align: 'right', sortable: true },
  ];

  const recordRows: SortableRow[] = [...profile.rounds].reverse().map((r, i) => ({
    key: `${r.year}-${r.sequence}-${i}`,
    sortValues: {
      year: r.year,
      event: r.eventName ?? r.eventType,
      score: r.trueScore,
      handicap: r.fsApplied,
      net: r.netScore,
      place: r.place,
      points: r.eventPoints,
    },
    cells: {
      year: r.year,
      event: (
        <span>
          {r.eventName ?? '—'}
          {r.eventType !== 'event' ? (
            <span className="ml-2">
              <Badge tone={r.eventType === 'championship' ? 'amber' : 'slate'}>
                {r.eventType}
              </Badge>
            </span>
          ) : null}
        </span>
      ),
      score: toPar(r.trueScore),
      handicap: <span className="text-slate-400">{fmt(r.fsApplied)}</span>,
      net: toPar(r.netScore),
      place: r.place ?? '—',
      points: fmt(r.eventPoints),
    },
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${slug}/players`}
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          ← All players
        </Link>
        <Avatar name={profile.name} photoUrl={profile.photoUrl} size="lg" />
        <h2 className="text-xl font-semibold">{profile.name}</h2>
        {profile.status === 'inactive' ? <Badge>inactive</Badge> : null}
        {profile.firstYear ? (
          <span className="text-sm text-slate-400">since {profile.firstYear}</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Rounds" value={String(played.length)} />
        <Stat label="Wins" value={String(wins)} />
        <Stat label="Top 3" value={String(podiums)} />
        <Stat label="Championships" value={String(champWins)} />
        <Stat label="Avg net" value={fmt(avg(nets), 2)} />
        <Stat label="Best round" value={nets.length ? toPar(Math.min(...nets)) : '—'} />
      </div>

      {played.length > 1 ? (
        <Card title="Net score, round by round">
          <p className="mb-2 text-xs text-slate-400">Lower is better.</p>
          <LineChart
            points={played.map((r, i) => ({
              x: i,
              y: r.netScore ?? 0,
              label: `${r.year} ${r.eventName ?? r.eventType}`,
            }))}
            label={`${profile.name} net score by round`}
          />
        </Card>
      ) : null}

      {profile.handicapHistory.length > 1 ? (
        <Card title="Handicap by season">
          <LineChart
            points={profile.handicapHistory.map((h) => ({
              x: h.year,
              y: h.fs,
              label: String(h.year),
            }))}
            color="#7c5cbf"
            label={`${profile.name} handicap by season`}
          />
        </Card>
      ) : null}

      <Card title={`Full record (${profile.rounds.length} entries)`}>
        {profile.rounds.length === 0 ? (
          <Empty>No rounds recorded.</Empty>
        ) : (
          <SortableTable columns={recordColumns} rows={recordRows} />
        )}
      </Card>

      {nonChamp.length > 0 ? (
        <p className="text-xs text-slate-400">
          Average finishing place across Events and Majors:{' '}
          {fmt(avg(nonChamp.map((r) => r.place ?? 0)), 2)}
        </p>
      ) : null}
    </div>
  );
}
