import Link from 'next/link';
import { getLeagues } from '@/lib/data/queries';
import { Empty } from '@/components/ui';
import { AuthBar } from '@/components/auth-bar';

/**
 * Chapter picker.
 *
 * No permission filtering here on purpose: row-level security decides which
 * leagues are visible, and this renders whatever comes back. An anonymous
 * visitor sees the chapters with a public board; a signed-in member also sees
 * any private chapter they belong to.
 */
export default async function HomePage() {
  const leagues = await getLeagues();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">AAGLA Golf</h1>
        <AuthBar />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Scores, handicaps and season standings.
      </p>

      {leagues.length === 0 ? (
        <Empty>No chapters available.</Empty>
      ) : (
        <ul className="mt-8 space-y-2">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/${league.slug}`}
                className="flex items-baseline justify-between rounded-xl border border-slate-200 p-4 hover:border-fairway-500 dark:border-slate-800"
              >
                <span className="font-medium">{league.name}</span>
                {league.chapter ? (
                  <span className="text-sm text-slate-400">{league.chapter}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Below the chapters, because it is not one of them: the ranking pools
        every chapter into a single table.
      */}
      <Link
        href="/rankings"
        className="mt-6 flex items-baseline justify-between rounded-xl border border-dashed border-slate-200 p-4 hover:border-fairway-500 dark:border-slate-800"
      >
        <span className="font-medium">
          World Ranking
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            experimental
          </span>
        </span>
        <span className="text-sm text-slate-400">All chapters</span>
      </Link>
    </main>
  );
}
