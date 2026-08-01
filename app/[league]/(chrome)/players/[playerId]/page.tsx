import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague, getPlayerProfile } from '@/lib/data/queries';
import { LineChart } from '@/components/chart';
import { Badge, Card, Empty, TableWrap, Td, Th, fmt, toPar } from '@/components/ui';

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
    xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <Link href={`/${slug}/players`} className="text-xs text-slate-400 hover:text-slate-600">
          ← All players
        </Link>
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
          <TableWrap>
            <thead>
              <tr>
                <Th align="right">Year</Th>
                <Th>Event</Th>
                <Th align="right">Score</Th>
                <Th align="right">Handicap</Th>
                <Th align="right">Net</Th>
                <Th align="right">Place</Th>
                <Th align="right">Points</Th>
              </tr>
            </thead>
            <tbody>
              {[...profile.rounds].reverse().map((r, i) => (
                <tr key={i}>
                  <Td align="right">{r.year}</Td>
                  <Td>
                    {r.eventName ?? '—'}
                    {r.eventType !== 'event' ? (
                      <span className="ml-2">
                        <Badge tone={r.eventType === 'championship' ? 'amber' : 'slate'}>
                          {r.eventType}
                        </Badge>
                      </span>
                    ) : null}
                  </Td>
                  <Td align="right">{toPar(r.trueScore)}</Td>
                  <Td align="right" muted>{fmt(r.fsApplied)}</Td>
                  <Td align="right">{toPar(r.netScore)}</Td>
                  <Td align="right">{r.place ?? '—'}</Td>
                  <Td align="right">{fmt(r.eventPoints)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
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
