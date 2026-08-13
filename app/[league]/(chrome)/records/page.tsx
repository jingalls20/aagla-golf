import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { getRecordPeople } from '@/lib/data/records';
import {
  activePeople,
  buildRecords,
  type RecordBoard,
  type RecordEntry,
  type RecordFormat,
} from '@/lib/domain/records';
import { Avatar } from '@/components/avatar';
import { ActiveOnlyToggle } from '@/components/selectors';
import { Empty, toPar } from '@/components/ui';
import { resolveActiveOnly } from '@/lib/prefs';

/**
 * The record book.
 *
 * Every figure here is computed across both chapters, because a record belongs
 * to a person and not to a roster row -- the opposite of the rule the rest of
 * the app follows. Counting records add a person's chapters together; "best
 * ever" records take whichever chapter the best came from and name it.
 *
 * The layout is the point of the screen. The holder is shown large and the two
 * values behind them small, so "who holds this" and "who is close" land in one
 * glance without reading a number. A shared record shows every holder at full
 * size rather than picking one -- a tie is two people holding the thing, not a
 * winner and an asterisk.
 */

/** How many people to show on a single chasing value before summarising. */
const CHASING_PER_TIER = 4;

function formatValue(value: number, format: RecordFormat): string {
  switch (format) {
    case 'count':
      return String(value);
    case 'toPar':
      return toPar(value);
    case 'strokes':
      return String(value);
    case 'avg':
      // Averages carry a decimal, so toPar's integer form won't do; the sign
      // still has to read the golfer's way.
      if (value === 0) return 'E';
      return value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }
}

/** The player row to link to: this chapter's if they have one, else any. */
function linkFor(entry: RecordEntry, slug: string): string {
  const here = entry.chapters.find((c) => c.leagueSlug === slug);
  const target = here ?? entry.chapters[0];
  return target ? `/${target.leagueSlug}/players/${target.playerId}` : '#';
}

function Holder({
  entry,
  format,
  slug,
  big,
}: {
  entry: RecordEntry;
  format: RecordFormat;
  slug: string;
  big: boolean;
}) {
  return (
    <Link
      href={linkFor(entry, slug)}
      className="group flex w-28 flex-col items-center gap-1 text-center sm:w-32"
    >
      <span
        className={
          big
            ? 'rounded-full ring-4 ring-fairway-500/70 transition group-hover:ring-fairway-600'
            : 'rounded-full ring-2 ring-slate-200 transition group-hover:ring-fairway-500 dark:ring-slate-700'
        }
      >
        <Avatar name={entry.name} photoUrl={entry.photoUrl} size={big ? 'xl' : 'lg'} />
      </span>
      <span
        className={`tabular-nums ${
          big
            ? 'mt-1 text-3xl font-bold leading-none'
            : 'text-lg font-semibold leading-none'
        }`}
      >
        {formatValue(entry.value, format)}
      </span>
      <span
        className={`font-medium leading-tight group-hover:text-fairway-600 ${
          big ? 'text-sm' : 'text-xs'
        }`}
      >
        {entry.name}
      </span>
      {entry.detail ? (
        <span className="text-[10px] leading-tight text-slate-400">{entry.detail}</span>
      ) : null}
    </Link>
  );
}

function Board({ board, slug }: { board: RecordBoard; slug: string }) {
  const [held, ...chasing] = board.tiers;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="h-1 bg-fairway-500" />
      <div className="p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {board.title}
        </h2>
        <p className="mt-0.5 text-xs leading-snug text-slate-400">{board.blurb}</p>

        {!held ? (
          <Empty>Nobody has one yet.</Empty>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-start justify-center gap-6">
              {held.entries.map((e) => (
                <Holder key={e.key} entry={e} format={board.format} slug={slug} big />
              ))}
            </div>
            {held.entries.length > 1 ? (
              <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-fairway-600 dark:text-fairway-50">
                shared by {held.entries.length}
              </p>
            ) : null}

            {chasing.length > 0 ? (
              <>
                <p className="mt-5 border-t border-slate-100 pt-3 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
                  Closest behind
                </p>
                {chasing.map((t) => {
                  // A record is shared by however many people hold it, so the
                  // top tier shows all of them. A chasing tier is only context,
                  // and a dozen portraits of people level on a common figure
                  // would bury the two names actually worth seeing.
                  const shown = t.entries.slice(0, CHASING_PER_TIER);
                  const hidden = t.entries.length - shown.length;
                  return (
                    <div
                      key={t.value}
                      className="mt-2 flex flex-wrap items-start justify-center gap-4"
                    >
                      {shown.map((e) => (
                        <Holder
                          key={e.key}
                          entry={e}
                          format={board.format}
                          slug={slug}
                          big={false}
                        />
                      ))}
                      {hidden > 0 ? (
                        <span className="self-center text-xs text-slate-400">
                          +{hidden} more on {formatValue(t.value, board.format)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export default async function RecordsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ activeOnly?: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const activeOnly = await resolveActiveOnly((await searchParams).activeOnly);

  const everyone = await getRecordPeople();
  // Filter first, then build: the boards are genuinely recomputed over the
  // smaller field rather than having rows hidden after the fact, so a record
  // can pass to whoever is next in line.
  const people = activeOnly ? activePeople(everyone) : everyone;
  const boards = buildRecords(people);
  const chapters = [
    ...new Set(people.flatMap((p) => p.chapters.map((c) => c.label))),
  ].sort();
  const setAside = everyone.length - people.length;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold">The record book</h1>
          <ActiveOnlyToggle on={activeOnly} />
        </div>
        <p className="mt-1 max-w-prose text-sm text-slate-500">
          Every record is all-time and counted across{' '}
          {chapters.length > 1
            ? `both chapters (${chapters.join(' and ')})`
            : 'the league'}
          . A player who has turned out for more than one chapter has their totals added
          together, and their bests are labelled with wherever they happened. Where two
          people share a figure, they share the record.
        </p>
        {activeOnly ? (
          <p className="mt-2 max-w-prose text-sm text-slate-500">
            Showing current members only
            {setAside > 0 ? (
              <>
                {' '}
                &mdash; {setAside} former {setAside === 1 ? 'member is' : 'members are'}{' '}
                set aside and every record below is recalculated without them
              </>
            ) : null}
            . Anyone still on a roster in either chapter counts, and their full career
            counts with them.
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {boards.map((b) => (
          <Board key={b.key} board={b} slug={slug} />
        ))}
      </div>
    </div>
  );
}
