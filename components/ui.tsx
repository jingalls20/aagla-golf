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

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

export function Th({
  children,
  align = 'left',
}: {
  // Optional: a header cell can be deliberately empty -- the actions column on
  // the admin players and seasons tables renders `<Th></Th>` as its spacer.
  children?: ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  // Tailwind scans source for complete class names, so `text-${align}` would
  // never be generated. The lookup keeps the strings literal and visible.
  return (
    <th
      className={`border-b border-slate-200 pb-2 pr-3 ${ALIGN[align]} text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800`}
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
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  muted?: boolean;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-slate-100 py-2 pr-3 ${ALIGN[align]} dark:border-slate-800/60 ${
        muted ? 'text-slate-400' : ''
      }`}
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
