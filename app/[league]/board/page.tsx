import { notFound } from 'next/navigation';
import {
  currentYearOf,
  getHandicaps,
  getLeague,
  getSeasons,
  getStandings,
} from '@/lib/data/queries';
import { fmt } from '@/components/ui';

/**
 * Public scoreboard.
 *
 * Deliberately has no navigation, no sign-in and no links: it is meant to be
 * dropped into an <iframe> on the league website. Everything it reads is
 * available to an anonymous visitor because the league has public_board set,
 * and player email addresses are not reachable from here at all -- they live in
 * a separate table that row-level security keeps admin-only.
 */
export const revalidate = 300;

export default async function BoardPage({
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

  const seasons = await getSeasons(league.id);
  if (seasons.length === 0) notFound();
  const years = seasons.map((s) => s.year);
  const year =
    yearParam && years.includes(Number(yearParam))
      ? Number(yearParam)
      : (currentYearOf(seasons) as number);

  const [standings, handicaps] = await Promise.all([
    getStandings(league.id, year),
    getHandicaps(league.id, year),
  ]);
  const active = handicaps.filter((h) => h.status === 'active');

  return (
    <div className="p-4 text-slate-900 dark:text-slate-100">
      <h1 className="mb-4 text-lg font-semibold">
        {league.name}
        <span className="ml-2 text-sm font-normal text-slate-400">{year}</span>
      </h1>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Season standings
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 pb-1 text-left dark:border-slate-800">
                  #
                </th>
                <th className="border-b border-slate-200 pb-1 text-left dark:border-slate-800">
                  Player
                </th>
                <th className="border-b border-slate-200 pb-1 text-right dark:border-slate-800">
                  Points
                </th>
                <th className="border-b border-slate-200 pb-1 text-right dark:border-slate-800">
                  Events Played
                </th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s) => (
                <tr key={s.playerId}>
                  <td className="border-b border-slate-100 py-1 dark:border-slate-800/60">
                    {s.seasonRank}
                  </td>
                  <td className="border-b border-slate-100 py-1 dark:border-slate-800/60">
                    {s.playerName}
                  </td>
                  <td className="border-b border-slate-100 py-1 text-right dark:border-slate-800/60">
                    {fmt(s.totalPoints)}
                  </td>
                  <td className="border-b border-slate-100 py-1 text-right dark:border-slate-800/60">
                    {s.eventsPlayed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Handicaps
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-500">
                <th className="border-b border-slate-200 pb-1 text-left dark:border-slate-800">
                  Player
                </th>
                <th className="border-b border-slate-200 pb-1 text-right dark:border-slate-800">
                  Free strokes
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((h) => (
                <tr key={h.playerId}>
                  <td className="border-b border-slate-100 py-1 dark:border-slate-800/60">
                    {h.playerName}
                  </td>
                  <td className="border-b border-slate-100 py-1 text-right dark:border-slate-800/60">
                    {fmt(h.fs, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <p className="mt-4 text-[11px] text-slate-400">
        Lowest points total wins. Updated automatically as scores are entered.
      </p>
    </div>
  );
}
