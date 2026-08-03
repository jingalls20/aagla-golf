import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { isLeagueAdmin } from '@/lib/data/admin';
import { getEventsForSeason, getSeasonsAdmin } from '@/lib/data/seasons';
import { addEvents, setEventStatus } from '@/lib/actions/admin';
import { Badge, Card, Empty, TableWrap, Th, Td } from '@/components/ui';
import { AddEventsForm } from '@/components/add-events-form';

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
          <TableWrap>
            <thead>
              <tr>
                <Th align="right">#</Th>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Date</Th>
                <Th>Course</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <Td align="right" muted>
                    {e.sequence}
                  </Td>
                  <Td>{e.name ?? '—'}</Td>
                  <Td muted>{e.eventType}</Td>
                  <Td muted>{e.eventDate ?? '—'}</Td>
                  <Td muted>{e.course ?? '—'}</Td>
                  <Td>
                    <form action={setEventStatus} className="flex items-center gap-2">
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="seasonId" value={seasonId} />
                      <input type="hidden" name="eventId" value={e.id} />
                      <select
                        name="status"
                        defaultValue={e.status}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <option value="scheduled">scheduled</option>
                        <option value="played">played</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        Update
                      </button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Add events">
        <p className="mb-3 text-xs text-slate-400">
          Name each event and pick its type. A Championship plays off a staggered
          handicap and never adds season points, so it&rsquo;s normally the last event of
          the year. Date and course are optional. New events are sequenced after
          whatever&rsquo;s already in this season, in the order you add them here. Once
          you enter a score for an event, it&rsquo;s automatically marked played.
        </p>
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
    </div>
  );
}
