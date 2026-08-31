import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { getHallSeasons } from '@/lib/data/hall';
import { buildHall, type HallEntry } from '@/lib/domain/hall';
import { Avatar } from '@/components/avatar';
import { Empty, toPar } from '@/components/ui';

/**
 * The Hall of Champions.
 *
 * One entry per season, newest first, each led by the winner's face. The
 * champion here is whoever won the Championship rather than whoever topped
 * the points table -- in this league those are usually different people,
 * and the trophy is what the page is named after. The blurb says so when
 * they differ, so the season's other story is never lost.
 *
 * Only this chapter's Championships appear. Seasons and standings are per
 * chapter everywhere except the record book, and a hall is a chapter's own.
 */

function Champion({
  champion,
  slug,
  titleNumber,
}: {
  champion: HallEntry['champions'][number];
  slug: string;
  titleNumber: number;
}) {
  return (
    <Link
      href={`/${slug}/players/${champion.playerId}`}
      className="group flex flex-col items-center gap-1.5 text-center"
    >
      <span className="rounded-full ring-4 ring-amber-300/70 transition group-hover:ring-amber-400 dark:ring-amber-500/50">
        <Avatar name={champion.name} photoUrl={champion.photoUrl} size="lg" />
      </span>
      <span className="text-sm font-semibold leading-tight group-hover:text-fairway-600">
        {champion.name}
      </span>
      {champion.netScore !== null ? (
        <span className="text-xs tabular-nums text-slate-400">
          {toPar(champion.netScore)} net
        </span>
      ) : null}
      {titleNumber > 1 ? (
        <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
          title #{titleNumber}
        </span>
      ) : null}
    </Link>
  );
}

function Season({ entry, slug }: { entry: HallEntry; slug: string }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-1 bg-amber-400" />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-start gap-4 sm:w-auto">
          <div className="w-14 shrink-0 text-right sm:w-16">
            <span className="text-2xl font-bold leading-none tabular-nums text-slate-300 dark:text-slate-600">
              {entry.year}
            </span>
          </div>
          <div className="flex flex-wrap gap-4">
            {entry.champions.map((c, i) => (
              <Champion
                key={c.playerId}
                champion={c}
                slug={slug}
                titleNumber={entry.titleNumbers[i]}
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {entry.shared ? (
            <p className="mb-1 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
              shared title
            </p>
          ) : null}
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {entry.blurb}
          </p>
          {entry.where ? (
            <p className="mt-1.5 text-xs text-slate-400">Played at {entry.where}.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default async function ChampionsPage({
  params,
}: {
  params: Promise<{ league: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const hall = buildHall(await getHallSeasons(league.id));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Hall of Champions</h1>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Every winner of the Championship, the event that closes each season, newest
          first. This is the trophy rather than the points table &mdash; the two are
          usually won by different people, and where they were, the note says who took
          the season. A year with more than one face was a tie, and both hold the title.
        </p>
      </div>

      {hall.length === 0 ? (
        <Empty>
          No Championship has been played here yet &mdash; the hall fills up as seasons
          finish.
        </Empty>
      ) : (
        <div className="space-y-3">
          {hall.map((entry) => (
            <Season key={entry.year} entry={entry} slug={slug} />
          ))}
        </div>
      )}
    </div>
  );
}
