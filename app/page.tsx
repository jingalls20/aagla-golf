import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/**
 * League picker.
 *
 * Anonymous visitors see only leagues with a public board, because that is
 * what the row-level security policy on `leagues` allows them to select. No
 * filtering is done here on purpose -- the database decides what is visible,
 * and this page renders whatever comes back.
 */
export default async function HomePage() {
  const supabase = await createClient();
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('slug, name, chapter')
    .order('name');

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">AAGLA Golf</h1>
        <p className="mt-4 text-red-600">Could not load leagues: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">AAGLA Golf</h1>

      {leagues && leagues.length > 0 ? (
        <ul className="mt-6 space-y-2">
          {leagues.map((league) => (
            <li key={league.slug as string}>
              <Link
                href={`/${league.slug}`}
                className="block rounded-lg border border-slate-200 p-4 hover:border-fairway-500 dark:border-slate-800"
              >
                <span className="font-medium">{league.name as string}</span>
                {league.chapter ? (
                  <span className="ml-2 text-sm text-slate-500">
                    {league.chapter as string}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-slate-500">No leagues yet.</p>
      )}
    </main>
  );
}
