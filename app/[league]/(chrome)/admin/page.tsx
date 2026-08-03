import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  currentYearOf,
  getEventResults,
  getEvents,
  getLeague,
  getPlayers,
  getSeasons,
} from '@/lib/data/queries';
import { getEntryHandicaps, getSeasonRow, isLeagueAdmin } from '@/lib/data/admin';
import { saveEventScores } from '@/lib/actions/scores';
import { Card, Empty, TableWrap, Th, Td, fmt } from '@/components/ui';
import { NavSelect } from '@/components/selectors';
import { DnpScoreInput } from '@/components/dnp-score-input';

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ year?: string; event?: string; saved?: string }>;
}) {
  const { league: slug } = await params;
  const { year: yearParam, event: eventParam, saved } = await searchParams;
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

  const seasons = await getSeasons(league.id);
  if (seasons.length === 0) return <Empty>No seasons yet.</Empty>;
  const years = seasons.map((s) => s.year);
  const year =
    yearParam && years.includes(Number(yearParam)) ? Number(yearParam) : (currentYearOf(seasons) as number);

  const allEvents = (await getEvents(league.id, year)).sort((a, b) => a.sequence - b.sequence);
  if (allEvents.length === 0) return <Empty>No events in {year} yet.</Empty>;

  const selectedEvent =
    allEvents.find((e) => e.id === eventParam) ??
    [...allEvents].reverse().find((e) => e.status !== 'cancelled') ??
    allEvents[0];

  const [players, results] = await Promise.all([
    getPlayers(league.id),
    getEventResults(selectedEvent.id),
  ]);
  const activePlayers = players
    .filter((p) => p.status === 'active')
    .sort((a, b) => a.name.localeCompare(b.name));

  const resultOf = new Map(results.map((r) => [r.playerId, r]));
  const existingDiff = results.find((r) => r.courseDifferential !== 0)?.courseDifferential ?? 0;

  // Handicap for every active player, so an admin can check a score nets
  // right before saving it -- the locked season figure where one exists, or
  // a live preview of what locking it now would produce.
  const seasonRow = await getSeasonRow(league.id, year);
  const handicapOf = seasonRow
    ? await getEntryHandicaps({
        leagueId: league.id,
        seasonId: seasonRow.id,
        priorYear: year - 1,
        bestOf: seasonRow.handicapBestOf,
        windowEvents: seasonRow.handicapWindowEvents,
        eventType: selectedEvent.eventType,
        playerIds: activePlayers.map((p) => p.id),
      })
    : new Map();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <NavSelect
            label="Season"
            value={String(year)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            hrefs={Object.fromEntries(years.map((y): [string, string] => [String(y), `/${slug}/admin?year=${y}`]))}
          />
          <NavSelect
            label="Event"
            value={selectedEvent.id}
            options={allEvents.map((e) => ({
              value: e.id,
              label: e.name ?? `Event #${e.legacyId ?? e.sequence}`,
            }))}
            hrefs={Object.fromEntries(
              allEvents.map((e): [string, string] => [e.id, `/${slug}/admin?year=${year}&event=${e.id}`]),
            )}
          />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link href={`/${slug}/admin/seasons`} className="text-slate-400 hover:text-fairway-600">
            Manage seasons →
          </Link>
          <Link href={`/${slug}/admin/players`} className="text-slate-400 hover:text-fairway-600">
            Manage players →
          </Link>
        </div>
      </div>

      {saved === '1' ? (
        <p className="rounded-lg border border-fairway-500 bg-fairway-50 p-3 text-sm text-fairway-600 dark:border-fairway-600 dark:bg-fairway-900 dark:text-fairway-50">
          Saved. Places and points below reflect the recomputed results.
        </p>
      ) : null}

      <Card
        title={`Enter scores — ${selectedEvent.name ?? `Event #${selectedEvent.legacyId ?? selectedEvent.sequence}`}`}
      >
        <p className="mb-4 text-xs text-slate-400">
          Score is strokes relative to par (e.g. <code>-2</code>, <code>0</code>, <code>5</code>).
          Leave a player blank to skip them — it won&rsquo;t erase a score they already have. The
          <strong> Handicap</strong> column shows what gets subtracted before ranking: a locked
          figure if this player already has a score this season, or a preview of what would lock
          in from their prior season if not — check it against the score you&rsquo;re about to
          enter. It locks automatically the first time you enter a score for them this season,
          exactly like the Handicaps screen explains, and stays put after that. Check{' '}
          <strong>DNP</strong> to record that a player did not play: they&rsquo;re placed last and
          given last place&rsquo;s points immediately, without waiting on anyone else, and it never
          touches their handicap. Saving recomputes place and points for the whole event, including
          no-show penalties once half the roster has posted a score or a DNP.
        </p>

        <form action={saveEventScores} className="space-y-4">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="eventId" value={selectedEvent.id} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="year" value={year} />

          <label className="flex max-w-xs items-center gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Course differential (applies to everyone below)
            </span>
            <input
              type="number"
              step="any"
              name="courseDifferential"
              defaultValue={existingDiff}
              className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>

          <TableWrap>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th align="right">Handicap</Th>
                <Th align="right">Score</Th>
                <Th align="right">Current place</Th>
                <Th align="right">Current points</Th>
              </tr>
            </thead>
            <tbody>
              {activePlayers.map((p) => {
                const existing = resultOf.get(p.id);
                const handicap = handicapOf.get(p.id);
                return (
                  <tr key={p.id}>
                    <Td>{p.name}</Td>
                    <Td align="right" muted>
                      {handicap ? (
                        <>
                          {fmt(handicap.fs, 2)}
                          {!handicap.locked ? (
                            <span className="ml-1 text-[10px] text-slate-400">(projected)</span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td align="right">
                      <DnpScoreInput
                        playerId={p.id}
                        defaultScore={existing?.trueScore ?? ''}
                        defaultDnp={existing?.source === 'dnp'}
                      />
                    </Td>
                    <Td align="right" muted>
                      {existing?.source === 'dnp' ? (
                        <span className="text-slate-400">DNP</span>
                      ) : (
                        (existing?.place ?? '—')
                      )}
                    </Td>
                    <Td align="right" muted>
                      {existing?.eventPoints ?? '—'}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>

          <button
            type="submit"
            className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
          >
            Save & recompute results
          </button>
        </form>
      </Card>
    </div>
  );
}
