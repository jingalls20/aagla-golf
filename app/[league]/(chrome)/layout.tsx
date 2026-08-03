import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { isLeagueAdmin } from '@/lib/data/admin';
import { AuthBar } from '@/components/auth-bar';

const TABS = [
  { href: '', label: 'Standings' },
  { href: '/history', label: 'History' },
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
  const admin = await isLeagueAdmin(league.id);
  const tabs = admin ? [...TABS, { href: '/admin', label: 'Admin' }] : TABS;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {/*
              `?chapters=1` is the escape hatch from the "remember my last
              chapter" redirect in middleware.ts -- without it, this link
              would just bounce straight back here.
            */}
            <Link href="/?chapters=1" className="text-xs text-slate-400 hover:text-slate-600">
              ← All chapters
            </Link>
            <h1 className="text-2xl font-semibold">{league.name}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/${slug}/board`}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Public scoreboard →
            </Link>
            <AuthBar next={`/${slug}`} />
          </div>
        </div>

        <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
          {tabs.map((tab) => (
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
