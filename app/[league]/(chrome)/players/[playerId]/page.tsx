import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  currentYearOf,
  getLeague,
  getPlayerCareer,
  getSeasons,
  type ChapterCareer,
} from '@/lib/data/queries';
import {
  careerSummary,
  careerTotals,
  isPlayed,
  seasonLines,
  type CareerRound,
  type SeasonLine,
} from '@/lib/domain/career';
import { LineChart } from '@/components/chart';
import { Avatar } from '@/components/avatar';
import { Collapsible } from '@/components/collapsible';
import { Badge, Empty, TableWrap, Td, Th, fmt, toPar } from '@/components/ui';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';

/**
 * A player's page, laid out like the back of a baseball card: a portrait and a
 * short career write-up up top, then one stat line per season.
 *
 * The season lines are the point. A golfer's career is a shape -- coming down
 * off a high handicap, a peak year, a tail -- and a flat list of ninety events
 * hides that shape completely. Each line expands to the events behind it, so
 * the detail is a click away rather than the first thing you meet.
 *
 * Players who turn out for both chapters get one page, and one table: every
 * season either chapter has for them, newest first, labelled with where it
 * happened. The rows sit together but never merge. Each one is still a single
 * chapter's season, which is what lets an average or a handicap on it mean
 * something -- blending the two would produce a number that describes nobody.
 * Only the counting stats at the top pool across chapters, because a win is
 * the same kind of thing wherever it was won.
 */

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[10px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function EventTypeBadge({ type }: { type: CareerRound['eventType'] }) {
  if (type === 'event') return null;
  return (
    <span className="ml-2">
      <Badge tone={type === 'championship' ? 'amber' : 'slate'}>{type}</Badge>
    </span>
  );
}

/** The rounds behind one season line, shown when its row is expanded. */
function SeasonDetail({ rounds }: { rounds: CareerRound[] }) {
  if (rounds.length === 0) {
    return <Empty>No rounds that season.</Empty>;
  }
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Event</Th>
          <Th align="right">Score</Th>
          <Th align="right">Handicap</Th>
          <Th align="right">Net</Th>
          <Th align="right">Place</Th>
          <Th align="right">Points</Th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rounds.map((r, i) => (
          <tr key={`${r.year}-${r.sequence}-${i}`}>
            <Td>
              {r.eventName ?? '—'}
              <EventTypeBadge type={r.eventType} />
            </Td>
            <Td align="right">{toPar(r.trueScore)}</Td>
            <Td align="right" muted>
              {fmt(r.fsApplied)}
            </Td>
            <Td align="right">{toPar(r.netScore)}</Td>
            <Td align="right">{r.place ?? '—'}</Td>
            <Td align="right" muted>
              {fmt(r.eventPoints)}
            </Td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

/** A season line paired with the chapter it belongs to. */
interface TaggedSeason {
  line: SeasonLine;
  chapter: ChapterCareer;
  label: string;
}

function seasonColumns(showChapter: boolean): SortableColumn[] {
  return [
    { key: 'year', label: 'Season', align: 'right', sortable: true },
    ...(showChapter
      ? [{ key: 'chapter', label: 'Chapter', sortable: true } as SortableColumn]
      : []),
    { key: 'rounds', label: 'Rounds', align: 'right', sortable: true },
    { key: 'avg', label: 'Avg', align: 'right', sortable: true },
    { key: 'net', label: 'Avg net', align: 'right', sortable: true },
    { key: 'best', label: 'Best', align: 'right', sortable: true },
    { key: 'wins', label: 'Wins', align: 'right', sortable: true },
    { key: 'podiums', label: 'Top 3', align: 'right', sortable: true },
    { key: 'points', label: 'Points', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
  ];
}

function seasonRows(seasons: TaggedSeason[], showChapter: boolean): SortableRow[] {
  // Mark the single best scoring season so the table agrees with what the
  // write-up claims. Resolved inside a chapter, like every other rate stat,
  // and single-round seasons are excluded so one lucky outing can't win it.
  const rated = seasons.filter((s) => s.line.rounds >= 2 && s.line.avgNet !== null);
  const bestKey = rated.length
    ? (() => {
        const b = rated.reduce((a, c) =>
          (c.line.avgNet as number) < (a.line.avgNet as number) ? c : a,
        );
        return `${b.chapter.leagueId}-${b.line.year}`;
      })()
    : null;

  return seasons.map(({ line: l, chapter, label }) => ({
    key: `${chapter.leagueId}-${l.year}`,
    className:
      `${chapter.leagueId}-${l.year}` === bestKey
        ? 'bg-fairway-50/60 dark:bg-fairway-900/20'
        : undefined,
    sortValues: {
      year: l.year,
      chapter: label,
      rounds: l.rounds,
      avg: l.avgScore,
      net: l.avgNet,
      best: l.bestNet,
      wins: l.wins,
      podiums: l.podiums,
      points: l.points,
      handicap: l.handicap,
    },
    cells: {
      year: (
        <span className="whitespace-nowrap font-medium">
          {l.year}
          {l.championship === 'won' ? (
            <span
              className="ml-1.5 text-amber-500"
              title={`Won the ${l.year} Championship`}
            >
              ★
            </span>
          ) : null}
          {`${chapter.leagueId}-${l.year}` === bestKey ? (
            <span
              className="ml-1.5 text-[9px] uppercase tracking-wide text-fairway-600 dark:text-fairway-50"
              title="Best scoring season"
            >
              best
            </span>
          ) : null}
        </span>
      ),
      ...(showChapter
        ? { chapter: <span className="text-slate-500">{label}</span> }
        : {}),
      rounds: l.rounds || '—',
      avg: (
        <span className="text-slate-400">
          {l.avgScore === null ? '—' : toPar(Math.round(l.avgScore))}
        </span>
      ),
      net: l.avgNet === null ? '—' : fmt(l.avgNet, 1),
      best: toPar(l.bestNet),
      wins: l.wins || '—',
      podiums: l.podiums || '—',
      points: <span className="text-slate-400">{fmt(l.points)}</span>,
      handicap: l.handicap ?? '—',
    },
    detail: <SeasonDetail rounds={chapter.rounds.filter((r) => r.year === l.year)} />,
  }));
}

function recordTable(chapters: ChapterCareer[], showChapter: boolean) {
  const columns: SortableColumn[] = [
    { key: 'year', label: 'Year', align: 'right', sortable: true },
    ...(showChapter
      ? [{ key: 'chapter', label: 'Chapter', sortable: true } as SortableColumn]
      : []),
    { key: 'event', label: 'Event', sortable: true },
    { key: 'score', label: 'Score', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
    { key: 'net', label: 'Net', align: 'right', sortable: true },
    { key: 'place', label: 'Place', align: 'right', sortable: true },
    { key: 'points', label: 'Points', align: 'right', sortable: true },
  ];

  const rows: SortableRow[] = chapters.flatMap((c) => {
    const label = c.chapter ?? c.leagueName;
    return c.rounds.map((r, i) => ({
      key: `${c.playerId}-${r.year}-${r.sequence}-${i}`,
      sortValues: {
        year: r.year,
        chapter: label,
        event: r.eventName ?? r.eventType,
        score: r.trueScore,
        handicap: r.fsApplied,
        net: r.netScore,
        place: r.place,
        points: r.eventPoints,
      },
      cells: {
        year: r.year,
        ...(showChapter
          ? { chapter: <span className="text-slate-400">{label}</span> }
          : {}),
        event: (
          <span>
            {r.eventName ?? '—'}
            <EventTypeBadge type={r.eventType} />
          </span>
        ),
        score: toPar(r.trueScore),
        handicap: <span className="text-slate-400">{fmt(r.fsApplied)}</span>,
        net: toPar(r.netScore),
        place: r.place ?? '—',
        points: fmt(r.eventPoints),
      },
    }));
  });

  return { columns, rows };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ league: string; playerId: string }>;
}) {
  const { league: slug, playerId } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const [career, seasons] = await Promise.all([
    getPlayerCareer(league.id, playerId),
    getSeasons(league.id),
  ]);
  if (!career) notFound();

  const multi = career.chapters.length > 1;
  const home = career.chapters[0];
  const allRounds = career.chapters.flatMap((c) => c.rounds);
  const totals = careerTotals(allRounds);
  const currentYear = currentYearOf(seasons);

  const byChapter = career.chapters.map((c) => ({
    chapter: c,
    label: c.chapter ?? c.leagueName,
    lines: seasonLines(c.rounds, c.handicapHistory),
  }));

  // One table, every chapter, newest first. Each row stays a single chapter's
  // season -- they sit together without merging.
  const tagged: TaggedSeason[] = byChapter.flatMap(({ chapter, label, lines }) =>
    lines.map((line) => ({ line, chapter, label })),
  );

  const summary = careerSummary({
    name: career.name,
    // Rate claims in the summary resolve inside a chapter, so it gets the
    // chapters rather than one merged pile of rounds.
    chapters: byChapter.map(({ chapter, label, lines }) => ({
      label,
      lines,
      rounds: chapter.rounds,
    })),
    currentYear,
  });

  // Handicap movement, read from the chapter they've played most -- the same
  // rule the summary uses, for the same reason.
  const busiest = [...byChapter].sort(
    (a, b) =>
      b.chapter.rounds.filter(isPlayed).length -
      a.chapter.rounds.filter(isPlayed).length,
  )[0];
  const hcHistory = busiest?.chapter.handicapHistory ?? [];
  const hcNow = hcHistory.length ? hcHistory[hcHistory.length - 1] : null;
  const hcThen = hcHistory.length ? hcHistory[0] : null;
  const hcDelta = hcNow && hcThen ? hcNow.fs - hcThen.fs : null;

  return (
    <div className="space-y-5">
      <Link
        href={`/${slug}/players`}
        className="inline-block text-xs text-slate-400 hover:text-slate-600"
      >
        ← All players
      </Link>

      {/* The front of the card. */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-fairway-50 to-white shadow-sm dark:border-slate-800 dark:from-slate-800 dark:to-slate-900">
        <div className="h-1.5 bg-fairway-500" />
        <div className="flex flex-col items-start gap-5 p-5 sm:flex-row">
          <div className="shrink-0">
            <div className="rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <Avatar name={career.name} photoUrl={career.photoUrl} size="xl" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {career.name}
              </h1>
              {home.status === 'inactive' ? <Badge>inactive</Badge> : null}
              {totals.championships > 0 ? (
                <Badge tone="amber">★ {totals.championships}× champion</Badge>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {career.chapters.map((c) => (
                <Badge
                  key={c.leagueId}
                  tone={c.leagueId === league.id ? 'green' : 'slate'}
                >
                  {c.chapter ?? c.leagueName}
                </Badge>
              ))}
              {totals.firstYear ? <span>since {totals.firstYear}</span> : null}
            </div>

            <p className="mt-3 max-w-prose text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {summary}
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat
          label="Rounds"
          value={String(totals.rounds)}
          hint={multi ? 'both chapters' : undefined}
        />
        <Stat label="Seasons" value={String(totals.seasons)} />
        <Stat
          label="Wins"
          value={String(totals.wins)}
          hint={totals.wins > 0 ? 'all types' : undefined}
        />
        <Stat label="Majors" value={String(totals.majorWins)} />
        <Stat label="Championships" value={String(totals.championships)} />
        <Stat label="Best round" value={toPar(totals.bestNet)} hint="net" />
        <Stat
          label="Handicap"
          value={hcNow ? String(hcNow.fs) : '—'}
          hint={
            hcDelta === null || hcDelta === 0
              ? hcNow
                ? `since ${hcNow.year}`
                : undefined
              : `${hcDelta < 0 ? '↓' : '↑'} ${Math.abs(hcDelta)} since ${hcThen?.year}`
          }
        />
      </div>

      <Collapsible
        title="Season by season"
        aside={`${tagged.length} ${tagged.length === 1 ? 'season' : 'seasons'}${multi ? ' · both chapters' : ''} · click a row for its events`}
        defaultOpen
      >
        {tagged.length === 0 ? (
          <Empty>No seasons recorded.</Empty>
        ) : (
          <SortableTable
            columns={seasonColumns(multi)}
            rows={seasonRows(tagged, multi)}
            defaultSort={{ key: 'year', dir: 'desc' }}
            sticky
          />
        )}
      </Collapsible>

      {byChapter.map(({ chapter: c, label }) => {
        const played = c.rounds.filter(isPlayed);
        if (played.length <= 1 && c.handicapHistory.length <= 1) return null;
        return (
          <div key={c.leagueId} className="space-y-3">
            {played.length > 1 ? (
              <Collapsible
                title={multi ? `${label} — net score by round` : 'Net score by round'}
                aside="lower is better"
                defaultOpen
              >
                <LineChart
                  points={played.map((r, i) => ({
                    x: i,
                    y: r.netScore ?? 0,
                    label: `${r.year} ${r.eventName ?? r.eventType}`,
                  }))}
                  label={`${career.name} net score by round in ${label}`}
                />
              </Collapsible>
            ) : null}

            {c.handicapHistory.length > 1 ? (
              <Collapsible
                title={multi ? `${label} — handicap by season` : 'Handicap by season'}
                aside={`${c.handicapHistory[0].year}–${c.handicapHistory[c.handicapHistory.length - 1].year} · lower is better`}
                defaultOpen
              >
                <LineChart
                  points={c.handicapHistory.map((h) => ({
                    x: h.year,
                    y: h.fs,
                    label: String(h.year),
                  }))}
                  color="#7c5cbf"
                  label={`${career.name} handicap by season in ${label}`}
                />
              </Collapsible>
            ) : null}
          </div>
        );
      })}

      <Collapsible
        title="Full record"
        aside={`${allRounds.length} ${allRounds.length === 1 ? 'entry' : 'entries'}`}
      >
        {allRounds.length === 0 ? (
          <Empty>No rounds recorded.</Empty>
        ) : (
          <SortableTable
            {...recordTable(career.chapters, multi)}
            defaultSort={{ key: 'year', dir: 'desc' }}
            sticky
          />
        )}
      </Collapsible>
    </div>
  );
}
