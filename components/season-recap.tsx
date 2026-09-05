import Link from 'next/link';
import { Avatar } from '@/components/avatar';

/**
 * The head of the first tab once a season is over.
 *
 * Between seasons the standings stop being a question -- nobody is chasing
 * anybody, and the table below is a result rather than a race. So the page
 * leads with what happened instead: who lifted the trophy, and the year told
 * as a report rather than listed as statistics.
 *
 * The superlatives used to sit here as a row of cards. They were folded into
 * the prose once the prose grew long enough to carry them -- naming the low
 * gross round in a sentence and again in a card underneath said it twice.
 *
 * Every word comes from `seasonRecapView`, which can only restate rounds it
 * was handed. Nothing here is written by a model or inferred.
 */

export interface RecapChampion {
  playerId: string;
  name: string;
  photoUrl: string | null;
}

export function SeasonRecap({
  year,
  slug,
  champions,
  paragraphs,
}: {
  year: number;
  slug: string;
  champions: RecapChampion[];
  /** The recap, one string per paragraph. */
  paragraphs: string[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-1 bg-amber-400" />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        {champions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-4">
            {champions.map((c) => (
              <Link
                key={c.playerId}
                href={`/${slug}/players/${c.playerId}`}
                className="group flex flex-col items-center gap-1.5 text-center"
              >
                <span className="rounded-full ring-4 ring-amber-300/70 transition group-hover:ring-amber-400 dark:ring-amber-500/50">
                  <Avatar name={c.name} photoUrl={c.photoUrl} size="lg" />
                </span>
                <span className="text-sm font-semibold leading-tight group-hover:text-fairway-600">
                  {c.name}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  champion
                </span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">The {year} season</h2>
          <div className="mt-2 space-y-3">
            {paragraphs.map((text, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-slate-600 dark:text-slate-300"
              >
                {text}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
