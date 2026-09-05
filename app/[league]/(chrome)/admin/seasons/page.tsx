import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { isLeagueAdmin } from '@/lib/data/admin';
import { getSeasonsAdmin } from '@/lib/data/seasons';
import {
  createSeason,
  setCurrentSeason,
  setSeasonOffseason,
} from '@/lib/actions/admin';
import { Badge, Card, Empty, TableWrap, Th, Td } from '@/components/ui';
import { TableHint } from '@/components/table-hint';

export default async function SeasonsAdminPage({
  params,
}: {
  params: Promise<{ league: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const admin = await isLeagueAdmin(league.id);
  if (!admin) {
    return (
      <Empty>
        You don&rsquo;t have admin access to {league.name}. If that&rsquo;s wrong, ask
        the league owner to add you in admin settings.
      </Empty>
    );
  }

  const seasons = await getSeasonsAdmin(league.id);
  const nextYear = (seasons[0]?.year ?? new Date().getFullYear()) + 1;

  return (
    <div className="space-y-6">
      <Link
        href={`/${slug}/admin`}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        ← Back to score entry
      </Link>

      <Card title="Seasons">
        <TableHint>
          <strong>Current</strong> is the season the app opens on.{' '}
          <strong>Offseason</strong> is for the stretch after the last card is in and
          before next year&rsquo;s schedule exists: the season stays current, but the
          first tab turns into a recap of the year instead of a live table, and the
          handicaps screen turns to face next season. Leave it on until the new schedule
          is ready &mdash; making the new season current is what ends it.
        </TableHint>
        {seasons.length === 0 ? (
          <Empty>No seasons yet — create one below.</Empty>
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Year</Th>
                <Th>Handicap rule</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.id}>
                  <Td>
                    <Link
                      href={`/${slug}/admin/seasons/${s.id}`}
                      className="font-medium hover:text-fairway-600 hover:underline"
                    >
                      {s.year}
                    </Link>
                  </Td>
                  <Td muted>
                    best {s.handicapBestOf} of last {s.handicapWindowEvents}
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1">
                      {s.isCurrent ? <Badge tone="green">current</Badge> : null}
                      {s.isOffseason ? <Badge tone="amber">offseason</Badge> : null}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="flex flex-wrap items-center justify-end gap-3">
                      {/*
                        The button sits outside the label rather than inside
                        it. A button nested in a label is safe by spec --
                        interactive descendants swallow the label's activation
                        -- but relying on that to stop "Save" silently
                        flipping the very checkbox it is saving is a subtlety
                        nobody should have to remember.
                      */}
                      <form action={setSeasonOffseason}>
                        <input type="hidden" name="leagueId" value={league.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="seasonId" value={s.id} />
                        <span className="flex items-center gap-1.5">
                          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <input
                              type="checkbox"
                              name="offseason"
                              defaultChecked={s.isOffseason}
                              className="cursor-pointer"
                            />
                            Offseason
                          </label>
                          <button
                            type="submit"
                            className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            Save
                          </button>
                        </span>
                      </form>
                      {!s.isCurrent ? (
                        <form action={setCurrentSeason}>
                          <input type="hidden" name="leagueId" value={league.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="seasonId" value={s.id} />
                          <button
                            type="submit"
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                          >
                            Make current
                          </button>
                        </form>
                      ) : null}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Create a season">
        <TableHint>
          Starts empty — you&rsquo;ll name and add its events on the next screen. It
          won&rsquo;t appear anywhere in the app as the current season until you make it
          current, so it&rsquo;s safe to build ahead of time while last season is still
          being played.
        </TableHint>
        <form action={createSeason} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Year
            </span>
            <input
              type="number"
              name="year"
              defaultValue={nextYear}
              className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Handicap: best of
            </span>
            <input
              type="number"
              name="handicapBestOf"
              defaultValue={3}
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              ...of last
            </span>
            <input
              type="number"
              name="handicapWindowEvents"
              defaultValue={7}
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
          >
            Create season
          </button>
        </form>
      </Card>
    </div>
  );
}
