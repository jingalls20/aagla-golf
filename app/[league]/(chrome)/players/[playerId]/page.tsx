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
 * hides that shape completely. The full list is still here, just folded away
 * underneath where it belongs.
 *
 * Players who turn out for both chapters get one page. Counting stats (rounds,
 * wins, championships) add up across chapters because they're the same kind of
 * thing wherever they happened. Handicaps, averages and season lines stay
 * separated by chapter, because a handicap earned in Iowa says nothing about
 * how someone plays in Seattle, and averaging the two would produce a number
 * that describes nobody.
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

/** The stat-line table: one row per season, career totals underneath. */
function SeasonTable({
  lines,
  rounds,
}: {
  lines: SeasonLine[];
  rounds: CareerRound[];
}) {
  if (lines.length === 0) return <Empty>No seasons recorded.</Empty>;

  const totals = careerTotals(rounds);
  // Highlighting the best scoring season is what makes the shape readable at a
  // glance. Single-round seasons are excluded so one lucky outing doesn't win.
  const rated = lines.filter((l) => l.rounds >= 2 && l.avgNet !== null);
  const bestYear = rated.length
    ? rated.reduce((a, b) => ((b.avgNet as number) < (a.avgNet as number) ? b : a)).year
    : null;

  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Season</Th>
          <Th align="right">Rounds</Th>
          <Th align="right">Avg</Th>
          <Th align="right">Avg net</Th>
          <Th align="right">Best</Th>
          <Th align="right">Wins</Th>
          <Th align="right">Top 3</Th>
          <Th align="right">Points</Th>
          <Th align="right">Handicap</Th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {lines.map((l) => (
          <tr
            key={l.year}
            className={
              l.year === bestYear
                ? 'bg-fairway-50/60 dark:bg-fairway-900/20'
                : undefined
            }
          >
            <Td>
              <span className="font-medium">{l.year}</span>
              {l.championship === 'won' ? (
                <span
                  className="ml-1.5 text-amber-500"
                  title={`Won the ${l.year} Championship`}
                >
                  ★
                </span>
              ) : null}
              {l.year === bestYear ? (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-fairway-600 dark:text-fairway-50">
                  best
                </span>
              ) : null}
            </Td>
            <Td align="right">{l.rounds || '—'}</Td>
            <Td align="right" muted>
              {l.avgScore === null ? '—' : toPar(Math.round(l.avgScore))}
            </Td>
            <Td align="right">{l.avgNet === null ? '—' : fmt(l.avgNet, 1)}</Td>
            <Td align="right">{toPar(l.bestNet)}</Td>
            <Td align="right">{l.wins || '—'}</Td>
            <Td align="right">{l.podiums || '—'}</Td>
            <Td align="right" muted>
              {fmt(l.points)}
            </Td>
            <Td align="right">{l.handicap ?? '—'}</Td>
          </tr>
        ))}
        <tr className="border-t-2 border-slate-300 font-semibold dark:border-slate-700">
          <Td>Career</Td>
          <Td align="right">{totals.rounds}</Td>
          <Td align="right" muted>
            —
          </Td>
          <Td align="right">{fmt(totals.avgNet, 1)}</Td>
          <Td align="right">{toPar(totals.bestNet)}</Td>
          <Td align="right">{totals.wins || '—'}</Td>
          <Td align="right">{totals.podiums || '—'}</Td>
          <Td align="right" muted>
            —
          </Td>
          <Td align="right">—</Td>
        </tr>
      </tbody>
    </TableWrap>
  );
}

function recordTable(chapter: ChapterCareer, showChapter: boolean) {
  const columns: SortableColumn[] = [
    { key: 'year', label: 'Year', align: 'right', sortable: true },
    ...(showChapter ? [{ key: 'chapter', label: 'Chapter', sortable: true }] : []),
    { key: 'event', label: 'Event', sortable: true },
    { key: 'score', label: 'Score', align: 'right', sortable: true },
    { key: 'handicap', label: 'Handicap', align: 'right', sortable: true },
    { key: 'net', label: 'Net', align: 'right', sortable: true },
    { key: 'place', label: 'Place', align: 'right', sortable: true },
    { key: 'points', label: 'Points', align: 'right', sortable: true },
  ];

  const label = chapter.chapter ?? chapter.leagueName;
  const rows: SortableRow[] = [...chapter.rounds].reverse().map((r, i) => ({
    key: `${chapter.playerId}-${r.year}-${r.sequence}-${i}`,
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
      chapter: <span className="text-slate-400">{label}</span>,
      event: (
        <span>
          {r.eventName ?? '—'}
          {r.eventType !== 'event' ? (
            <span className="ml-2">
              <Badge tone={r.eventType === 'championship' ? 'amber' : 'slate'}>
                {r.eventType}
              </Badge>
            </span>
          ) : null}
        </span>
      ),
      score: toPar(r.trueScore),
      handicap: <span className="text-slate-400">{fmt(r.fsApplied)}</span>,
      net: toPar(r.netScore),
      place: r.place ?? '—',
      points: fmt(r.eventPoints),
    },
  }));

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

  const summary = careerSummary({
    name: career.name,
    // Rate claims in the summary resolve inside a chapter, so it gets the
    // chapters rather than one merged pile of rounds.
    chapters: career.chapters.map((c) => ({
      label: c.chapter ?? c.leagueName,
      lines: seasonLines(c.rounds, c.handicapHistory),
      rounds: c.rounds,
    })),
    currentYear,
  });

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Rounds"
          value={String(totals.rounds)}
          hint={multi ? 'both chapters' : undefined}
        />
        <Stat label="Seasons" value={String(totals.seasons)} />
        <Stat
          label="Wins"
          value={String(totals.wins)}
          hint={totals.championships > 0 ? 'incl. championships' : undefined}
        />
        <Stat label="Top 3" value={String(totals.podiums)} />
        <Stat label="Championships" value={String(totals.championships)} />
        <Stat label="Best round" value={toPar(totals.bestNet)} hint="net" />
      </div>

      {career.chapters.map((c) => {
        const lines = seasonLines(c.rounds, c.handicapHistory);
        const label = c.chapter ?? c.leagueName;
        const played = c.rounds.filter((r) => r.trueScore !== null);

        return (
          <div key={c.leagueId} className="space-y-3">
            {multi ? (
              <h2 className="pt-1 text-xs font-semibold uppercase tracking-widest text-slate-400">
                {label}
              </h2>
            ) : null}

            <Collapsible
              title={multi ? `${label} — season by season` : 'Season by season'}
              aside={`${lines.length} ${lines.length === 1 ? 'season' : 'seasons'}`}
              defaultOpen
            >
              <SeasonTable lines={lines} rounds={c.rounds} />
            </Collapsible>

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
                aside={`${c.handicapHistory[0].year}–${c.handicapHistory[c.handicapHistory.length - 1].year}`}
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

            <Collapsible
              title={multi ? `${label} — full record` : 'Full record'}
              aside={`${c.rounds.length} ${c.rounds.length === 1 ? 'entry' : 'entries'}`}
            >
              {c.rounds.length === 0 ? (
                <Empty>No rounds recorded.</Empty>
              ) : (
                <SortableTable {...recordTable(c, multi)} />
              )}
            </Collapsible>
          </div>
        );
      })}
    </div>
  );
}
