import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';

const TABS = [
  { href: '', label: 'Standings' },
  { href: '/events', label: 'Results' },
  { href: '/handicaps', label: 'Handicaps' },
  { href: '/players', label: 'Players' },
];

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ league: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-600">
              ← All chapters
            </Link>
            <h1 className="text-2xl font-semibold">{league.name}</h1>
          </div>
          <Link
            href={`/${slug}/board`}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Public scoreboard →
          </Link>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={`/${slug}${tab.href}`}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-600 hover:border-fairway-500 hover:text-fairway-600 dark:text-slate-300"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
