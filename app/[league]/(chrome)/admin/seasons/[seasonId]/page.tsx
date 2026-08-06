import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { isLeagueAdmin } from '@/lib/data/admin';
import { getEventsForSeason, getSeasonsAdmin } from '@/lib/data/seasons';
import { addEvents, deleteEvent, deleteSeason, updateEvent, updateSeasonRules } from '@/lib/actions/admin';
import { Badge, Card, Empty, TableWrap, Th, Td } from '@/components/ui';
import { AddEventsForm } from '@/components/add-events-form';
import { TableHint } from '@/components/table-hint';
import { ConfirmSubmitButton } from '@/components/confirm-button';

export default async function SeasonEventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string; seasonId: string }>;
  searchParams: Promise<{ added?: string }>;
}) {
  const { league: slug, seasonId } = await params;
  const { added } = await searchParams;
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
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) notFound();

  const events = await getEventsForSeason(seasonId);

  return (
    <div className="space-y-6">
      <Link
        href={`/${slug}/admin/seasons`}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        ← All seasons
      </Link>

      <Card
        title={
          <>
            {season.year} events {season.isCurrent ? <Badge tone="green">current</Badge> : null}
          </>
        }
      >
        {added ? (
          <p className="mb-3 rounded-lg border border-fairway-500 bg-fairway-50 p-3 text-sm text-fairway-600 dark:border-fairway-600 dark:bg-fairway-900 dark:text-fairway-50">
            Added {added} event{added === '1' ? '' : 's'}.
          </p>
        ) : null}

        {events.length === 0 ? (
          <Empty>No events yet — add some below.</Empty>
        ) : (
          <TableHint>
            Edit any field and Save to correct it -- a mistyped name, a wrong date, or the
            order events play in. Delete removes an event and every score recorded for
            it, so it&rsquo;s meant for one added by mistake, not a round that actually
            happened.
          </TableHint>
        )}

        {events.length === 0 ? null : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <Td>
                    <form
                      action={updateEvent}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="seasonId" value={seasonId} />
                      <input type="hidden" name="eventId" value={e.id} />
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Seq
                        </span>
                        <input
                          type="number"
                          name="sequence"
                          defaultValue={e.sequence}
                          className="w-14 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Name
                        </span>
                        <input
                          type="text"
                          name="name"
                          defaultValue={e.name ?? ''}
                          className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Type
                        </span>
                        <select
                          name="eventType"
                          defaultValue={e.eventType}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <option value="event">event</option>
                          <option value="major">major</option>
                          <option value="championship">championship</option>
                        </select>
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Date
                        </span>
                        <input
                          type="date"
                          name="eventDate"
                          defaultValue={e.eventDate ?? ''}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Course
                        </span>
                        <input
                          type="text"
                          name="course"
                          defaultValue={e.course ?? ''}
                          className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        />
                      </label>
                      <label className="flex flex-col text-[10px]">
                        <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
                          Status
                        </span>
                        <select
                          name="status"
                          defaultValue={e.status}
                          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                        >
                          <option value="scheduled">scheduled</option>
                          <option value="played">played</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </label>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        Save
                      </button>
                    </form>
                  </Td>
                  <Td align="right">
                    <form action={deleteEvent}>
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="seasonId" value={seasonId} />
                      <input type="hidden" name="eventId" value={e.id} />
                      <ConfirmSubmitButton
                        confirmText={`Delete "${e.name ?? `event #${e.sequence}`}" and every score recorded for it? This can't be undone.`}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Add events">
        <TableHint>
          Name each event and pick its type. A Championship plays off a staggered
          handicap and never adds season points, so it&rsquo;s normally the last event of
          the year. Date and course are optional. New events are sequenced after
          whatever&rsquo;s already in this season, in the order you add them here. Once
          you enter a score for an event, it&rsquo;s automatically marked played.
        </TableHint>
        <form action={addEvents} className="space-y-4">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <AddEventsForm />
          <button
            type="submit"
            className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
          >
            Add events
          </button>
        </form>
      </Card>

      <Card title="Handicap rule">
        <TableHint>
          Average of a player&rsquo;s best <strong>N</strong> true scores from their last{' '}
          <strong>M</strong> Event or Major rounds of the previous season. Changing this
          only affects players who lock their {season.year} handicap after the change --
          anyone already locked keeps the figure they got under the old rule.
        </TableHint>
        <form action={updateSeasonRules} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="seasonId" value={seasonId} />
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Best of
            </span>
            <input
              type="number"
              name="handicapBestOf"
              defaultValue={season.handicapBestOf}
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
              defaultValue={season.handicapWindowEvents}
              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            Save
          </button>
        </form>
      </Card>

      {events.length === 0 ? (
        <Card title="Delete this season">
          <p className="mb-3 text-xs text-slate-400">
            Only possible while it has no events -- for a season created by mistake
            (wrong year, a duplicate), not one with results in it.
          </p>
          <form action={deleteSeason}>
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="seasonId" value={seasonId} />
            <ConfirmSubmitButton
              confirmText={`Delete the ${season.year} season? This can't be undone.`}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-900/20"
            >
              Delete {season.year} season
            </ConfirmSubmitButton>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
