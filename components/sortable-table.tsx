'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TableWrap } from './ui';

/**
 * A table where every column marked `sortable` can be sorted by clicking its
 * header: ascending, then descending, then back to the original order.
 *
 * This takes fully pre-rendered data rather than render callbacks. That's
 * not a style choice -- a Server Component is not allowed to hand a Client
 * Component a function prop (rowKey/renderCell/sortValue closures all fail
 * to cross that boundary; React can serialize JSX and plain data, not
 * functions). So the server page does the rendering and the sort-key
 * extraction up front, and this component only ever touches plain data:
 * `cells` for what to show and `sortValues` for how to order it.
 */

const ALIGN = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

export interface SortableColumn {
  key: string;
  label: ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Set false for a column that shouldn't be clickable (e.g. free text). */
  sortable?: boolean;
}

export interface SortableRow {
  /** Stable row identity, e.g. a player or score id. */
  key: string;
  className?: string;
  /** Pre-rendered content for each column, keyed by column key. */
  cells: Record<string, ReactNode>;
  /** Plain sort keys for each sortable column, keyed by column key. */
  sortValues?: Record<string, string | number | null>;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function SortableTable({
  columns,
  rows,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
}) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = a.sortValues?.[sort.key] ?? null;
      const bv = b.sortValues?.[sort.key] ?? null;
      const dir = sort.dir === 'asc' ? 1 : -1;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  }, [rows, sort]);

  function onSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  return (
    <TableWrap>
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              onClick={c.sortable ? () => onSort(c.key) : undefined}
              className={`border-b border-slate-200 pb-2 pr-3 ${ALIGN[c.align ?? 'left']} text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 ${
                c.sortable ? 'cursor-pointer select-none hover:text-fairway-600' : ''
              }`}
            >
              <span className="inline-flex items-center gap-1">
                {c.label}
                {c.sortable ? (
                  <span className="w-2.5 text-[9px] text-slate-400">
                    {sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                  </span>
                ) : null}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((row) => (
          <tr key={row.key} className={row.className}>
            {columns.map((c) => (
              <td
                key={c.key}
                className={`border-b border-slate-100 py-2 pr-3 ${ALIGN[c.align ?? 'left']} dark:border-slate-800/60`}
              >
                {row.cells[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
