import Link from 'next/link';
import { getRatingRounds } from '@/lib/data/rating';
import { buildRatings, MIN_ROUNDS, WINDOW_SEASONS } from '@/lib/domain/rating';
import type { RatingRow } from '@/lib/domain/rating';
import { Avatar } from '@/components/avatar';
import { AuthBar } from '@/components/auth-bar';
import { Empty, TableWrap, Td, Th } from '@/components/ui';

/**
 * The world ranking: one table across both chapters.
 *
 * It sits at the root rather than under `/[league]` on purpose. Everything
 * else in this app belongs to a chapter -- seasons, handicaps, standings --
 * and putting the ranking beside the chapter selector rather than inside a
 * chapter is the clearest way to say that this one does not.
 *
 * Labelled experimental, and meant. Two chapters joined by five people who
 * have played both is thin evidence for a single ordering, so the page says
 * as much rather than presenting the number as settled.
 */

export const metadata = {
  title: 'World Ranking · AAGLA Golf',
};

function Movement({ row }: { row: RatingRow }) {
  if (row.previousRating === null) {
    return (
      <span className="text-[10px] uppercase tracking-wider text-fairway-600">new</span>
    );
  }
  const delta = row.rating - row.previousRating;
  if (Math.abs(delta) < 1) return <span className="text-slate-300">—</span>;
  const up = delta > 0;
  return (
    <span
      className={`tabular-nums text-xs ${up ? 'text-fairway-600' : 'text-rose-500'}`}
    >
      {up ? '▲' : '▼'} {Math.abs(Math.round(delta))}
    </span>
  );
}

function PlayerCell({ row }: { row: RatingRow }) {
  const home = row.chapters[0];
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={row.name} photoUrl={row.photoUrl} size="md" />
      <div className="min-w-0">
        <Link
          href={`/${home.leagueSlug}/players/${home.playerId}`}
          className="font-medium hover:text-fairway-600"
        >
          {row.name}
        </Link>
        <div className="text-xs text-slate-400">
          {row.chapters.map((c) => c.label).join(' · ')}
        </div>
      </div>
    </div>
  );
}

function Table({ rows, ranked }: { rows: RatingRow[]; ranked: boolean }) {
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th align="right">{ranked ? '#' : ''}</Th>
          <Th>Player</Th>
          <Th align="right">Rating</Th>
          <Th align="right">±</Th>
          <Th align="right">Move</Th>
          <Th align="right">Rounds</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.personKey}>
            <Td align="right" muted>
              {row.rank ?? '—'}
            </Td>
            <Td>
              <PlayerCell row={row} />
            </Td>
            <Td align="right">
              <span className="font-semibold tabular-nums">{row.rating}</span>
            </Td>
            {/*
              The deviation is shown rather than tucked away because it is the
              honest half of the number beside it: a 1600 give-or-take-70 and a
              1600 give-or-take-300 are not the same claim.
            */}
            <Td align="right" muted>
              <span className="tabular-nums">±{row.deviation}</span>
            </Td>
            <Td align="right">
              <Movement row={row} />
            </Td>
            <Td align="right" muted>
              <span className="tabular-nums">{row.rounds}</span>
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

export default async function RankingsPage() {
  const rows = buildRatings(await getRatingRounds());
  const ranked = rows.filter((r) => !r.provisional);
  const provisional = rows.filter((r) => r.provisional);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <Link
              href="/?chapters=1"
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              ← All chapters
            </Link>
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
              World Ranking
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
                experimental
              </span>
            </h1>
          </div>
          <AuthBar next="/rankings" />
        </div>
      </header>

      <div className="space-y-3 text-sm leading-relaxed text-slate-500">
        <p>
          One table across every chapter, rolling over the last {WINDOW_SEASONS}{' '}
          seasons. Each event is treated as a round robin &mdash; you are rated against
          everyone you outscored that day and everyone who outscored you &mdash; so
          beating a strong field counts for more than beating a thin one. Majors and the
          Championship carry more weight, and recent seasons carry more than older ones.
        </p>
        <p>
          Ratings run on gross scores rather than net. The handicap is built to pull
          everyone back toward even, so a ranking on net would measure who is beating
          their own number rather than who is playing best.
        </p>
        <p>
          Treat this as a work in progress. The two chapters are joined by only the
          handful of people who have played in both, which is thin evidence for ordering
          one against the other; the &plusmn; beside each rating is how unsure the maths
          is about it.
        </p>
      </div>

      <section className="mt-8">
        {ranked.length === 0 ? (
          <Empty>Nobody has enough recent rounds to be ranked yet.</Empty>
        ) : (
          <Table rows={ranked} ranked />
        )}
      </section>

      {provisional.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            Provisional
          </h2>
          <p className="mb-3 mt-1 text-sm text-slate-500">
            Fewer than {MIN_ROUNDS} rounds in the window. Rated, but not ranked &mdash;
            there is not yet enough to place them against everyone else.
          </p>
          <Table rows={provisional} ranked={false} />
        </section>
      ) : null}
    </main>
  );
}
