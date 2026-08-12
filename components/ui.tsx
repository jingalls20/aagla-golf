import type { ReactNode } from 'react';

/** Shared presentation primitives, kept in one place so every table on every
 *  screen reads the same way. */

export function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {title ? (
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Scroll container for a table.
 *
 * `sticky` turns it into a capped-height box that scrolls in both directions,
 * which is what lets a header row and a first column stay put. Sticky
 * positioning only works against an ancestor that actually scrolls, and a
 * container whose height grows with its content never does -- the page scrolls
 * instead, and the header slides away with it. Hence the cap.
 *
 * 75vh is high enough that a table which already fits on screen behaves
 * exactly as it did before; the box only starts scrolling once the table is
 * long enough that you would have lost the header anyway.
 */
export function TableWrap({
  children,
  sticky = false,
}: {
  children: ReactNode;
  sticky?: boolean;
}) {
  if (sticky) {
    return (
      <div className="max-h-[75vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full min-w-full border-collapse text-sm">{children}</table>
      </div>
    );
  }
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

/**
 * Class fragments for pinning a header row and a first column.
 *
 * A pinned cell has to carry its own opaque background or the cells sliding
 * underneath show through it. `bg-inherit` on a body cell picks up whatever
 * the row is tinted with, so a highlighted row stays highlighted where it is
 * pinned; the header sets a real colour because it has no row to inherit from.
 *
 * The z-order matters in one place: where the pinned column crosses the
 * pinned header, that corner cell has to outrank both.
 */
const PIN_EDGE = 'border-r border-slate-200 dark:border-slate-800';

export const STICKY = {
  header: 'sticky top-0 z-20 bg-white dark:bg-slate-900',
  column: `sticky left-0 z-10 bg-inherit ${PIN_EDGE}`,
  corner: `sticky left-0 top-0 z-30 bg-white dark:bg-slate-900 ${PIN_EDGE}`,
  // Offsets for the column sitting immediately right of a pinned expander
  // chevron. `left-6` matches the `w-6` that column is given.
  columnAfterExpander: `sticky left-6 z-10 bg-inherit ${PIN_EDGE}`,
  cornerAfterExpander: `sticky left-6 top-0 z-30 bg-white dark:bg-slate-900 ${PIN_EDGE}`,
  // The expander column itself is pinned but sits mid-block, so it takes no
  // edge -- the divider belongs after the column that names the row.
  expander: 'sticky left-0 z-10 bg-inherit',
  expanderCorner: 'sticky left-0 top-0 z-30 bg-white dark:bg-slate-900',
} as const;

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

export function Th({
  children,
  align = 'left',
  className = '',
}: {
  // Optional: a header cell can be deliberately empty -- the actions column on
  // the admin players and seasons tables renders `<Th></Th>` as its spacer.
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  // Tailwind scans source for complete class names, so `text-${align}` would
  // never be generated. The lookup keeps the strings literal and visible.
  return (
    <th
      className={`border-b border-slate-200 pb-2 pr-3 ${ALIGN[align]} text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = 'left',
  muted = false,
  colSpan,
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  muted?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-slate-100 py-2 pr-3 ${ALIGN[align]} dark:border-slate-800/60 ${
        muted ? 'text-slate-400' : ''
      } ${className}`}
    >
      {children}
    </td>
  );
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode;
  tone?: 'slate' | 'green' | 'amber';
}) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-fairway-50 text-fairway-600 dark:bg-fairway-900 dark:text-fairway-50',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

/** Formats a score relative to par the way golfers say it: +4, -2, E. */
export function toPar(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return 'E';
  return value > 0 ? `+${value}` : String(value);
}

export function fmt(value: number | null, digits = 1): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}
