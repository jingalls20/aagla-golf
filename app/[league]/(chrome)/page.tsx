import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  championIdsOf,
  getSeasonChampionId,
  currentYearOf,
  isOffseason,
  getEvents,
  getLeague,
  getSeasonScores,
  getSeasons,
  getStandings,
} from '@/lib/data/queries';
import { Badge, Card, Empty, fmt, toPar } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { InactiveToggle } from '@/components/selectors';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';
import { TableHint } from '@/components/table-hint';
import { eventHeaderLabel } from '@/lib/event-label';
import { seasonRecapView } from '@/lib/domain/offseason';
import { getRecapPast } from '@/lib/data/recap-history';
import { SeasonRecap } from '@/components/season-recap';
import { championshipHandicap } from '@/lib/domain/handicap';
import { resolveShowInactive } from '@/lib/prefs';
import type { ScoreRow } from '@/lib/data/queries';
import type { ReactNode } from 'react';

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ showInactive?: string }>;
}) {
  const { league: slug } = await params;
  const { showInactive: showInactiveParam } = await searchParams;
  const showInactive = await resolveShowInactive(showInactiveParam);
  const league = await getLeague(slug);
  if (!league) notFound();

  const seasons = await getSeasons(league.id);
  const year = currentYearOf(seasons);
  if (year === null) return <Empty>No seasons yet.</Empty>;
  // Between seasons the same data reads as a result rather than a race. See
  // migration 0016 -- it is an admin's word, not something inferred from
  // whether every event happens to have a score.
  const offseason = isOffseason(seasons);

  const [standings, events, scores, namedChampionId] = await Promise.all([
    getStandings(league.id, year),
    getEvents(league.id, year),
    getSeasonScores(league.id, year),
    getSeasonChampionId(league.id, year),
  ]);

  // Only the recap needs the chapter's whole archive, so it is only paid for
  // between seasons rather than on every visit during one.
  const past = offseason ? await getRecapPast(league.id, year) : null;

  const visibleStandings = showInactive
    ? standings
    : standings.filter((s) => s.playerStatus === 'active');

  const championIds = championIdsOf(events, scores, namedChampionId);

  // Who tied the Championship on the card but does not hold the trophy. A
  // playoff moves no scores, so without this the recap sees a tie and has no
  // idea it was ever settled.
  const championshipId = events.find((e) => e.eventType === 'championship')?.id;
  const playoffLoserIds = championshipId
    ? scores
        .filter(
          (s) =>
            s.eventId === championshipId &&
            s.place === 1 &&
            s.trueScore !== null &&
            !championIds.has(s.playerId),
        )
        .map((s) => s.playerId)
    : [];

  // Player × event grid. Every event in the season gets a column, played or
  // not -- an admin scanning the season wants to see what's still ahead, not
  // just what's already in the books.
  // In season, every event gets a column whether or not it has been played --
  // an admin scanning the table wants to see what is still ahead. Once the
  // season is over there is no "ahead", and a column of dashes for an event
  // that never happened is just a hole in the recap.
  const scoredEventIds = new Set(scores.map((s) => s.eventId));
  const seasonEvents = offseason
    ? events.filter((e) => scoredEventIds.has(e.id))
    : events;
  const cell = new Map<string, ScoreRow>();
  const playerMeta = new Map<
    string,
    { name: string; status: 'active' | 'inactive'; photoUrl: string | null }
  >();
  for (const s of scores) {
    cell.set(`${s.playerId}:${s.eventId}`, s);
    playerMeta.set(s.playerId, {
      name: s.playerName,
      status: s.playerStatus,
      photoUrl: s.playerPhotoUrl,
    });
  }
  const allRowPlayers = [...playerMeta.entries()].sort((a, b) =>
    a[1].name.localeCompare(b[1].name),
  );
  const rowPlayers = showInactive
    ? allRowPlayers
    : allRowPlayers.filter(([, meta]) => meta.status === 'active');

  // "Championship start" is a projection of a round still to be played, so
  // once the Championship is in the books it is answering a question nobody
  // is asking any more. Dropped rather than frozen: a stale projection sitting
  // beside a finished result invites being read as a fact.
  const standingsColumns: SortableColumn[] = (
    [
      { key: 'rank', label: '#', align: 'right', sortable: true },
      { key: 'player', label: 'Player', sortable: true },
      { key: 'points', label: 'Event Points', align: 'right', sortable: true },
      { key: 'played', label: 'Events Played', align: 'right', sortable: true },
      {
        key: 'championshipStart',
        // The figure moves with the standings, so it is a projection rather
        // than a fact until the Championship is actually played. This screen
        // only ever shows the current season, so the caveat is always true
        // here -- the History tab, which shows finished seasons, says nothing
        // of the sort.
        label: (
          <span className="inline-block leading-tight">
            Championship start
            <span className="block text-[10px] font-normal normal-case tracking-normal text-slate-400">
              if the season ended today
            </span>
          </span>
        ),
        align: 'right',
        sortable: true,
      },
    ] as SortableColumn[]
  ).filter((c) => !(offseason && c.key === 'championshipStart'));
  const standingsRows: SortableRow[] = visibleStandings.map((s) => {
    // What this player would start the Championship round on if the season
    // ended today: the season leader plays their full handicap, and every
    // place after that gives up one more stroke -- same rule the
    // Championship event itself applies (see championshipHandicap). That
    // function returns strokes in the same sign as a season handicap (higher
    // is a bigger advantage); a "starting score" reads the opposite way --
    // strokes already on the board before teeing off -- so it's shown
    // negated, and same as any relative-to-par figure, is free to land on
    // either side of zero: a big handicap starts well under (e.g. "-13"), a
    // player who already gives strokes back can end up starting over
    // (e.g. "+4") once the stagger takes more from them.
    const championshipStart = -championshipHandicap(s.handicap ?? 0, s.seasonRank);
    return {
      key: s.playerId,
      sortValues: {
        rank: s.seasonRank,
        player: s.playerName,
        points: s.totalPoints,
        played: s.eventsPlayed,
        championshipStart,
      },
      cells: {
        rank: s.seasonRank,
        player: (
          <Link
            href={`/${slug}/players/${s.playerId}`}
            className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
          >
            <Avatar name={s.playerName} photoUrl={s.playerPhotoUrl} />
            <span>
              {s.playerName}
              {s.handicap !== null ? (
                <span className="ml-1 text-slate-400">({fmt(s.handicap)})</span>
              ) : null}
              {championIds.has(s.playerId) ? (
                <span className="ml-1" title={`${year} Championship winner`}>
                  🏆
                </span>
              ) : null}
              {s.playerStatus === 'inactive' ? (
                <span className="ml-1.5 align-middle text-[10px] text-slate-400">
                  inactive
                </span>
              ) : null}
            </span>
          </Link>
        ),
        points: fmt(s.totalPoints),
        played: s.eventsPlayed,
        championshipStart: (
          <span className="text-slate-400">{toPar(championshipStart)}</span>
        ),
      },
    };
  });

  const gridColumns: SortableColumn[] = [
    { key: 'player', label: 'Player', sortable: true },
    ...seasonEvents.map((e): SortableColumn => ({
      key: e.id,
      // Plain text, not a link -- this header doubles as the sort control,
      // and a nested <a> would hijack the click into a navigation instead
      // of a sort. The event's own page is still reachable from its rows
      // elsewhere (Events tab), just not from this column header.
      label: (
        <span>
          {eventHeaderLabel(e)}
          {e.eventType !== 'event' ? (
            <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-400">
              {e.eventType}
            </span>
          ) : null}
        </span>
      ),
      align: 'center',
      sortable: true,
    })),
  ];
  // What the season's drop rule set aside, per player, so the grid can strike
  // it through. Empty for a chapter or season without the rule.
  const droppedOf = new Map(
    standings.map((s): [string, ReadonlySet<string>] => [
      s.playerId,
      new Set(s.droppedEventIds),
    ]),
  );
  const droppedAny = standings.some((s) => s.droppedEventIds.length > 0);

  const gridRows: SortableRow[] = rowPlayers.map(([playerId, meta]) => {
    const cells: Record<string, ReactNode> = {
      player: (
        <Link
          href={`/${slug}/players/${playerId}`}
          className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
        >
          <Avatar name={meta.name} photoUrl={meta.photoUrl} />
          <span className="whitespace-nowrap">
            {meta.name}
            {championIds.has(playerId) ? (
              <span className="ml-1" title={`${year} Championship winner`}>
                🏆
              </span>
            ) : null}
          </span>
        </Link>
      ),
    };
    const sortValues: Record<string, string | number | null> = { player: meta.name };
    for (const e of seasonEvents) {
      const s = cell.get(`${playerId}:${e.id}`);
      const dnp = s?.source === 'missed' || s?.source === 'dnp';
      // Struck through and red: on the card, but left out of the total.
      // Colour alone would not say which of those two things it means.
      const droppedHere = droppedOf.get(playerId)?.has(e.id) ?? false;
      cells[e.id] = !s ? (
        <span className="text-slate-400">—</span>
      ) : (
        <span
          className={`whitespace-nowrap ${
            droppedHere
              ? 'text-red-500 line-through decoration-red-400 dark:text-red-400'
              : dnp
                ? 'text-slate-400'
                : ''
          }`}
          title={droppedHere ? 'Dropped: worst finish of the season' : undefined}
        >
          <span className="font-semibold tabular-nums">{s.place ?? '—'}</span>
          <span
            className={`ml-1 text-[10px] leading-tight tracking-tight ${
              droppedHere ? 'text-red-400' : 'text-slate-400'
            }`}
          >
            {dnp ? 'DNP' : toPar(s.netScore)}&middot;{fmt(s.eventPoints)}
          </span>
        </span>
      );
      sortValues[e.id] = s?.netScore ?? null;
    }
    return { key: playerId, cells, sortValues };
  });

  // The recap reads the whole field, not the filtered view: hiding a player
  // who has left the chapter should not quietly erase the round of the year
  // they shot before going.
  const eventLabels = new Map(events.map((e) => [e.id, eventHeaderLabel(e)]));
  const recap = offseason
    ? seasonRecapView({
        year,
        standings: standings.map((s) => ({
          playerId: s.playerId,
          playerName: s.playerName,
          totalPoints: s.totalPoints,
          eventsPlayed: s.eventsPlayed,
          seasonRank: s.seasonRank,
        })),
        rounds: scores.map((s) => {
          const event = events.find((e) => e.id === s.eventId);
          return {
            playerId: s.playerId,
            playerName: s.playerName,
            eventId: s.eventId,
            eventLabel: eventLabels.get(s.eventId) ?? null,
            eventType: event?.eventType ?? ('event' as const),
            sequence: event?.sequence ?? 0,
            trueScore: s.trueScore,
            netScore: s.netScore,
            place: s.place,
            eventPoints: s.eventPoints,
          };
        }),
        championIds: [...championIds],
        // Anyone the scores show winning who did not end up with the
        // trophy lost a playoff -- that is the only way the two differ.
        playoffLoserIds: playoffLoserIds,
        history: past?.history,
        previousChampionId: past?.previousChampionId,
        eventsPlayed: scoredEventIds.size,
        eventsScheduled: events.length,
      })
    : null;

  const recapChampions = [...championIds]
    .map((id) => {
      const meta = playerMeta.get(id);
      return meta ? { playerId: id, name: meta.name, photoUrl: meta.photoUrl } : null;
    })
    .filter((c): c is { playerId: string; name: string; photoUrl: string | null } =>
      Boolean(c),
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          {offseason ? 'Season complete' : 'Current season'}{' '}
          <span className="font-medium text-slate-600 dark:text-slate-300">{year}</span>
          {offseason ? (
            <span className="ml-2 align-middle">
              <Badge tone="amber">offseason</Badge>
            </span>
          ) : null}
        </p>
        <InactiveToggle show={showInactive} />
      </div>

      {recap ? (
        <SeasonRecap
          year={year}
          slug={slug}
          champions={recapChampions}
          paragraphs={recap.paragraphs}
        />
      ) : null}

      <Card title={`${year} ${offseason ? 'final standings' : 'season standings'}`}>
        <TableHint>
          Lowest total wins — winning an event scores zero. A player&rsquo;s handicap is
          shown in parentheses next to their name.{' '}
          {offseason ? null : (
            <>
              <strong>Championship start</strong> is where they&rsquo;d begin the
              Championship round relative to par if the season ended today: the leader
              keeps their full handicap, and every place after that gives up one more
              stroke. Like a net score, a big handicap starts well under par, and a
              small or negative one can start over.{' '}
            </>
          )}
          Championships are excluded from Event Points, but 🏆 marks that year&rsquo;s
          Championship winner, wherever they landed in the standings.
        </TableHint>
        {visibleStandings.length === 0 ? (
          <Empty>No results recorded for {year} yet.</Empty>
        ) : (
          // Not sticky, deliberately. Pinning the header means capping the
          // wrapper's height and scrolling inside it, and on a phone that
          // inner scroller swallows the touch gesture -- you drag expecting
          // the page to move and the table moves instead. This table is five
          // columns wide and fits, so the header was never at risk of
          // scrolling away; it cost a phone-hostile scroll container and
          // bought nothing. The events grid below keeps its sticky header,
          // where a wide table genuinely does scroll out from under you.
          <SortableTable columns={standingsColumns} rows={standingsRows} />
        )}
      </Card>

      <Card title={`${year} ${offseason ? 'season, round by round' : 'events'}`}>
        <TableHint>
          Every event in the season, played or not. The big number is finishing place;
          below it, net score relative to par and event points earned. A dash means that
          round hasn&rsquo;t been recorded yet. Click a column header to sort by that
          event.
          {droppedAny ? (
            <>
              {' '}
              A result <span className="text-red-500 line-through">in red</span> is this
              chapter&rsquo;s dropped worst finish: it stays on the card but is left out
              of the season total. Majors are never dropped, and the rule only applies
              once a player has two results to choose between. A DNP counts as a result
              and can be the one dropped; an event with no entry yet is not a result at
              all, so it is never mistaken for someone&rsquo;s worst.
            </>
          ) : null}
        </TableHint>
        {seasonEvents.length === 0 ? (
          <Empty>No events scheduled for {year} yet.</Empty>
        ) : gridRows.length === 0 ? (
          <Empty>No scores recorded for {year} yet.</Empty>
        ) : (
          <SortableTable columns={gridColumns} rows={gridRows} sticky dense />
        )}
      </Card>
    </div>
  );
}
