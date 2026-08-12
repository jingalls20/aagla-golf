import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentYearOf, getHandicaps, getLeague, getSeasons } from '@/lib/data/queries';
import type { HandicapRow } from '@/lib/data/queries';
import {
  describeHandicap,
  eventLabelOf,
  type ConsideredRound,
  type Consistency,
} from '@/lib/domain/handicap';
import { Badge, Card, Empty, TableWrap, Td, Th, fmt } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { InactiveToggle, NavSelect } from '@/components/selectors';
import {
  SortableTable,
  type SortableColumn,
  type SortableRow,
} from '@/components/sortable-table';
import { TableHint } from '@/components/table-hint';
import { resolveShowInactive } from '@/lib/prefs';

/**
 * The handicaps screen, which is really a screen about *trust*.
 *
 * A locked handicap decides how a player's whole season scores, so the useful
 * question is never just "what is it" but "how did you get that, and how solid
 * is it". Every figure here is therefore shown with its working: which rounds
 * counted, which didn't, and what the number would have been under a couple of
 * plausible alternative rules.
 *
 * Three seasons are in play and conflating them is the easy mistake. The
 * heading year is the season whose handicaps are locked. The rounds behind
 * them come from the year before. The projection is what next year's figure
 * would be if the season in progress stopped today.
 */

const CONSISTENCY_TONE: Record<Consistency, 'green' | 'slate' | 'amber'> = {
  steady: 'green',
  variable: 'slate',
  streaky: 'amber',
};

/** Lower is better, so a fall is an improvement. */
function Movement({ from, to }: { from: number | null; to: number }) {
  if (from === null) return <span className="text-slate-300">—</span>;
  const delta = to - from;
  if (delta === 0) return <span className="text-slate-400">held</span>;
  const down = delta < 0;
  return (
    <span
      className={down ? 'text-fairway-600 dark:text-fairway-50' : 'text-amber-600'}
      title={`${from} in the previous season`}
    >
      {down ? '↓' : '↑'} {Math.abs(delta)}
    </span>
  );
}

function ScoreList({ rounds, muted }: { rounds: ConsideredRound[]; muted?: boolean }) {
  if (rounds.length === 0) return <span className="text-slate-300">—</span>;
  return (
    <span className={muted ? 'text-slate-400' : 'font-medium'}>
      {rounds.map((r) => r.trueScore).join(', ')}
    </span>
  );
}

/** One alternative figure, with the rule that produced it. */
function AltFigure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] leading-tight text-slate-400">{note}</div>
    </div>
  );
}

/** The full working behind one player's handicap. */
function Working({ h, year }: { h: HandicapRow; year: number }) {
  const priorYear = year - 1;
  const c = h.computed;

  if (!c) {
    return (
      <Empty>
        No {priorYear} Event or Major rounds on record, so there was nothing to
        calculate from.
      </Empty>
    );
  }

  const all = [
    ...c.outsideWindow.map((r) => ({ ...r, used: false, inWindow: false })),
    ...c.considered.map((r) => ({ ...r, inWindow: true })),
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">{describeHandicap(c, priorYear)}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AltFigure
          label="Locked"
          value={String(h.fs)}
          note={h.isOverride ? 'set by an admin' : 'the rule as written'}
        />
        <AltFigure
          label="If all counted"
          value={c.allConsideredFs === null ? '—' : String(c.allConsideredFs)}
          note={`every one of the ${c.considered.length} rounds in the window`}
        />
        <AltFigure
          label="Best round dropped"
          value={c.withoutBestFs === null ? '—' : String(c.withoutBestFs)}
          note={
            c.withoutBestFs === null
              ? 'needs more than one round'
              : `moves ${Math.abs(c.withoutBestFs - c.fs)} from the locked figure`
          }
        />
        <AltFigure
          label="Spread"
          value={c.spread === null ? '—' : `${c.spread}`}
          note={
            c.stdDev === null
              ? 'needs at least two rounds'
              : `worst minus best · sd ${c.stdDev}`
          }
        />
      </div>

      {h.isOverride ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          An admin set this to {h.fs}. The calculation would have given {c.fs}
          {c.fs === h.fs
            ? ' — the same figure.'
            : `, a difference of ${Math.abs(h.fs - c.fs)}.`}
        </p>
      ) : null}

      <div>
        <h3 className="mb-1.5 text-[10px] uppercase tracking-wider text-slate-400">
          Every {priorYear} round, in order played
        </h3>
        <TableWrap>
          <thead>
            <tr>
              <Th>Event</Th>
              <Th align="right">Score</Th>
              <Th>Counted?</Th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {all.map((r, i) => (
              <tr
                key={`${r.sequence}-${i}`}
                className={
                  r.used ? 'bg-fairway-50/70 dark:bg-fairway-900/20' : undefined
                }
              >
                <Td>
                  {eventLabelOf(r)}
                  {r.eventType !== 'event' ? (
                    <span className="ml-2">
                      <Badge>{r.eventType}</Badge>
                    </span>
                  ) : null}
                </Td>
                <Td align="right">
                  <span className={r.used ? 'font-semibold' : 'text-slate-400'}>
                    {r.trueScore}
                  </span>
                </Td>
                <Td>
                  {r.used ? (
                    <Badge tone="green">counted</Badge>
                  ) : r.inWindow ? (
                    <span className="text-xs text-slate-400">
                      in the window, not among the best
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">too early to count</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </div>

      <p className="text-xs text-slate-500">
        {h.projected
          ? `If ${year} stopped today, ${h.playerName.split(' ')[0]}'s ${year + 1} ` +
            `handicap would be ${h.projected.fs}, from ${h.projectedRounds} round(s) ` +
            `played so far.`
          : `No ${year} rounds yet, so there is nothing to project from.`}
      </p>
    </div>
  );
}

export default async function HandicapsPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ year?: string; showInactive?: string }>;
}) {
  const { league: slug } = await params;
  const { year: yearParam, showInactive: showInactiveParam } = await searchParams;
  const showInactive = await resolveShowInactive(showInactiveParam);
  const league = await getLeague(slug);
  if (!league) notFound();

  const seasons = await getSeasons(league.id);
  if (seasons.length === 0) return <Empty>No seasons yet.</Empty>;
  const years = seasons.map((s) => s.year);
  const year =
    yearParam && years.includes(Number(yearParam))
      ? Number(yearParam)
      : (currentYearOf(seasons) as number);
  const priorYear = year - 1;
  const allHandicaps = await getHandicaps(league.id, year);
  const handicaps = showInactive
    ? allHandicaps
    : allHandicaps.filter((h) => h.status === 'active');

  const columns: SortableColumn[] = [
    { key: 'player', label: 'Player', sortable: true },
    { key: 'fs', label: 'Handicap', align: 'right', sortable: true },
    { key: 'move', label: 'vs last year', align: 'right', sortable: true },
    { key: 'used', label: 'Scores counted', align: 'right' },
    { key: 'unused', label: 'Not counted', align: 'right' },
    { key: 'all', label: 'If all counted', align: 'right', sortable: true },
    { key: 'consistency', label: 'Consistency', sortable: true },
    {
      key: 'projected',
      label: `${year + 1} projected`,
      align: 'right',
      sortable: true,
    },
  ];

  const rows: SortableRow[] = handicaps.map((h) => {
    const c = h.computed;
    const used = c?.considered.filter((r) => r.used) ?? [];
    const unused = c?.considered.filter((r) => !r.used) ?? [];

    return {
      key: h.playerId,
      sortValues: {
        player: h.playerName,
        fs: h.fs,
        move: h.priorFs === null ? null : h.fs - h.priorFs,
        all: c?.allConsideredFs ?? null,
        consistency: c?.stdDev ?? null,
        projected: h.projected?.fs ?? null,
      },
      cells: {
        player: (
          <Link
            href={`/${slug}/players/${h.playerId}`}
            className="flex items-center gap-2 hover:text-fairway-600 hover:underline"
          >
            <Avatar name={h.playerName} photoUrl={h.photoUrl} />
            <span className="whitespace-nowrap">{h.playerName}</span>
            {h.status === 'inactive' ? <Badge>inactive</Badge> : null}
          </Link>
        ),
        fs: (
          <span className="whitespace-nowrap">
            <span className="font-semibold tabular-nums">{fmt(h.fs)}</span>
            {h.isOverride ? (
              <span className="ml-1.5">
                <Badge tone="amber">set</Badge>
              </span>
            ) : null}
          </span>
        ),
        move: (
          <span className="whitespace-nowrap tabular-nums">
            <Movement from={h.priorFs} to={h.fs} />
          </span>
        ),
        used: <ScoreList rounds={used} />,
        unused: <ScoreList rounds={unused} muted />,
        all: (
          <span className="tabular-nums text-slate-500">
            {c?.allConsideredFs ?? '—'}
          </span>
        ),
        consistency: c?.consistency ? (
          <span className="whitespace-nowrap">
            <Badge tone={CONSISTENCY_TONE[c.consistency]}>{c.consistency}</Badge>
            {c.spread !== null ? (
              <span className="ml-1.5 text-xs text-slate-400">spread {c.spread}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
        projected: (
          <span className="tabular-nums">
            {h.projected ? (
              <>
                {h.projected.fs}
                <span className="ml-1 text-xs text-slate-400">
                  ({h.projectedRounds})
                </span>
              </>
            ) : (
              <span className="text-slate-300">—</span>
            )}
          </span>
        ),
      },
      detail: <Working h={h} year={year} />,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NavSelect
          label="Season"
          value={String(year)}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
          hrefs={Object.fromEntries(
            years.map((y): [string, string] => [
              String(y),
              `/${slug}/handicaps?year=${y}`,
            ]),
          )}
        />
        <InactiveToggle show={showInactive} />
      </div>

      <Card title={`${year} handicaps`}>
        <TableHint>
          Locked for the season: the average of a player&rsquo;s best 3 true scores from
          their last 7 Event or Major rounds of {priorYear}, rounded to the nearest
          whole stroke. A negative figure means the player gives strokes back. Click any
          row for the full working — every {priorYear} round, what counted, and what the
          figure would have been under other rules.
        </TableHint>
        {handicaps.length === 0 ? (
          <Empty>No handicaps locked for {year} yet.</Empty>
        ) : (
          <SortableTable
            columns={columns}
            rows={rows}
            defaultSort={{ key: 'player', dir: 'asc' }}
            sticky
          />
        )}
      </Card>
    </div>
  );
}
