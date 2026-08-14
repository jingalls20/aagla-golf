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
import { saveEventScores, clearScore } from '@/lib/actions/scores';
import { postEventRecap } from '@/lib/actions/recaps';
import { eventRecapInput } from '@/lib/data/recaps';
import { eventRecap } from '@/lib/domain/recap';
import { discordConfigured } from '@/lib/discord';
import { POSTED_MESSAGE } from '@/lib/recap-messages';
import { Card, Empty, TableWrap, Th, Td, fmt } from '@/components/ui';
import { NavSelect } from '@/components/selectors';
import { ScoreEntryCells } from '@/components/score-entry-cells';
import { TableHint } from '@/components/table-hint';
import { ConfirmSubmitButton } from '@/components/confirm-button';

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{
    year?: string;
    event?: string;
    saved?: string;
    posted?: string;
  }>;
}) {
  const { league: slug } = await params;
  const { year: yearParam, event: eventParam, saved, posted } = await searchParams;
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
    yearParam && years.includes(Number(yearParam))
      ? Number(yearParam)
      : (currentYearOf(seasons) as number);

  const allEvents = (await getEvents(league.id, year)).sort(
    (a, b) => a.sequence - b.sequence,
  );
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

  // The recap for the event on screen. Generated here so it can be read
  // before it is sent -- but regenerated server-side on submit, so what
  // actually posts reflects any score fixed in between.
  const recapInput = await eventRecapInput(league.id, league.name, selectedEvent.id);
  const eventPreview = recapInput ? eventRecap(recapInput) : null;
  const discordReady = discordConfigured(slug);
  const postedNote = posted ? POSTED_MESSAGE[posted] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <NavSelect
            label="Season"
            value={String(year)}
            options={years.map((y) => ({ value: String(y), label: String(y) }))}
            hrefs={Object.fromEntries(
              years.map((y): [string, string] => [
                String(y),
                `/${slug}/admin?year=${y}`,
              ]),
            )}
          />
          <NavSelect
            label="Event"
            value={selectedEvent.id}
            options={allEvents.map((e) => ({
              value: e.id,
              label: e.name ?? `Event #${e.legacyId ?? e.sequence}`,
            }))}
            hrefs={Object.fromEntries(
              allEvents.map((e): [string, string] => [
                e.id,
                `/${slug}/admin?year=${year}&event=${e.id}`,
              ]),
            )}
          />
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            href={`/${slug}/admin/seasons`}
            className="text-slate-400 hover:text-fairway-600"
          >
            Manage seasons →
          </Link>
          <Link
            href={`/${slug}/admin/players`}
            className="text-slate-400 hover:text-fairway-600"
          >
            Manage players →
          </Link>
          <Link
            href={`/${slug}/admin/members`}
            className="text-slate-400 hover:text-fairway-600"
          >
            Manage admin access →
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
        <TableHint>
          Score is strokes relative to par (e.g. <code>-2</code>, <code>0</code>,{' '}
          <code>5</code>). Leave a player blank to skip them — it won&rsquo;t erase a
          score they already have. The <strong>Handicap</strong> column shows what gets
          subtracted before ranking: a locked figure if this player already has a score
          this season, or a preview of what would lock in from their prior season if not
          — check it against the score you&rsquo;re about to enter. It locks
          automatically the first time you enter a score for them this season, exactly
          like the Handicaps screen explains, and stays put after that.{' '}
          <strong>Course diff.</strong> only matters for a player who played a different
          course than the rest of the field that day — leave it at 0 for everyone
          playing the usual course. Check <strong>DNP</strong> to record that a player
          did not play: they&rsquo;re placed last and given last place&rsquo;s points
          immediately, without waiting on anyone else, and it never touches their
          handicap. Saving recomputes place and points for the whole event, including
          no-show penalties once half the roster has posted a score or a DNP. Use{' '}
          <strong>Clear</strong> to remove a score entered by mistake entirely, rather
          than saving over it. Scores are <strong>total strokes over par</strong>, and
          the <strong>Net</strong> column recalculates as you type so you can check a
          figure before committing it. A <strong>Save</strong> button appears on any row
          you change: it saves that one player, so you can enter scores one at a time as
          they come in. It saves only that row — anything typed on other rows is left
          alone, so use the button at the bottom to commit several at once.
        </TableHint>

        <form action={saveEventScores} className="space-y-4">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="eventId" value={selectedEvent.id} />
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="year" value={year} />

          <TableWrap>
            <thead>
              <tr>
                <Th>Player</Th>
                <Th align="right">Handicap</Th>
                <Th align="right">Course diff.</Th>
                <Th align="right" className="bg-fairway-50/60 dark:bg-fairway-900/20">
                  <span className="inline-block leading-tight">
                    Score
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-fairway-600 dark:text-fairway-50">
                      total strokes over par
                    </span>
                  </span>
                </Th>
                <Th align="right">
                  <span className="inline-block leading-tight">
                    Net
                    <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
                      updates as you type
                    </span>
                  </span>
                </Th>
                <Th align="right">Current place</Th>
                <Th align="right">Current points</Th>
                <Th></Th>
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
                          {fmt(handicap.fs)}
                          {!handicap.locked ? (
                            <span className="ml-1 text-[10px] text-slate-400">
                              (projected)
                            </span>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <ScoreEntryCells
                      playerId={p.id}
                      defaultScore={existing?.trueScore ?? ''}
                      defaultDiff={existing?.courseDifferential || ''}
                      defaultDnp={existing?.source === 'dnp'}
                      handicap={handicap ? handicap.fs : null}
                    />
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
                    <Td align="right">
                      {existing ? (
                        // Routed via formAction, not a nested <form> -- this
                        // row lives inside the score-entry form already, and
                        // HTML doesn't allow a <form> inside a <form>. The
                        // name/value pair below is how clearScore learns
                        // which player, since it isn't a dedicated hidden
                        // input; leagueId/eventId/slug/year ride along on
                        // the enclosing form's own hidden inputs.
                        <ConfirmSubmitButton
                          formAction={clearScore}
                          name="playerId"
                          value={p.id}
                          confirmText={`Clear ${p.name}'s entry for this event? This removes it entirely, not just its score.`}
                          className="text-xs text-slate-400 hover:text-red-600"
                        >
                          Clear
                        </ConfirmSubmitButton>
                      ) : null}
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
            Save every row & recompute
          </button>
        </form>
      </Card>

      <Card title="Post this event's recap to Discord">
        {postedNote ? (
          <p
            className={`mb-3 rounded-lg border p-3 text-sm ${
              postedNote.tone === 'good'
                ? 'border-fairway-500 bg-fairway-50 text-fairway-600 dark:border-fairway-600 dark:bg-fairway-900 dark:text-fairway-50'
                : 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200'
            }`}
          >
            {postedNote.text}
          </p>
        ) : null}

        <TableHint>
          Written from the scores above, so it can&rsquo;t say anything the results
          don&rsquo;t. Read it before you send it. The text is rebuilt at the moment you
          post, so a score you fix after previewing is the one that goes out, and
          posting twice sends it twice.
        </TableHint>

        {!discordReady ? (
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Posting is off until a webhook is set on the <strong>aagla-golf</strong>{' '}
            Vercel project — see the note on{' '}
            <Link
              href={`/${slug}/admin/seasons`}
              className="underline hover:text-fairway-600"
            >
              any season&rsquo;s page
            </Link>{' '}
            for the details. Adding the variable only takes effect on the next deploy.
          </p>
        ) : null}

        {eventPreview ? (
          <>
            <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs leading-relaxed dark:bg-slate-950">
              {eventPreview}
            </pre>
            <form action={postEventRecap} className="mt-2">
              <input type="hidden" name="leagueId" value={league.id} />
              <input type="hidden" name="leagueName" value={league.name} />
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonRow?.id ?? ''} />
              <input type="hidden" name="eventId" value={selectedEvent.id} />
              {/* Come back here rather than to the season screen -- posting
                  straight after entering the scores is the whole point. */}
              <input type="hidden" name="returnTo" value="admin" />
              <input type="hidden" name="year" value={year} />
              <ConfirmSubmitButton
                confirmText="Post this recap to Discord? Everyone in the channel will see it."
                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Post recap
              </ConfirmSubmitButton>
            </form>
          </>
        ) : (
          <Empty>
            Nothing to recap yet — enter a score above and it&rsquo;ll appear here.
          </Empty>
        )}

        <p className="mt-3 text-xs text-slate-400">
          Season recaps, and recaps for any other event, live on{' '}
          <Link
            href={`/${slug}/admin/seasons`}
            className="underline hover:text-fairway-600"
          >
            the season&rsquo;s page
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
