'use client';

import { Fragment, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { STICKY, TableWrap } from './ui';

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
 * `cells` for what to show and `sortValues` for how to order it. A row's
 * expanded `detail` follows the same rule: it arrives as already-rendered JSX,
 * not a callback.
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
  /** Pre-rendered content revealed when the row is expanded. A row without
   *  one is not expandable. */
  detail?: ReactNode;
}

type SortState = { key: string; dir: 'asc' | 'desc' } | null;

export function SortableTable({
  columns,
  rows,
  defaultSort = null,
  sticky = false,
}: {
  columns: SortableColumn[];
  rows: SortableRow[];
  /** Initial ordering. Cycling a column past descending returns here rather
   *  than to the unsorted input order, so the table always has an order the
   *  reader was promised. */
  defaultSort?: SortState;
  /** Pin the header row and the first column while the table is scrolled.
   *  Worth it for anything wide enough to scroll sideways, where losing sight
   *  of who a row belongs to makes the numbers meaningless. */
  sticky?: boolean;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const expandable = rows.some((r) => r.detail !== undefined);

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
      return defaultSort;
    });
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <TableWrap sticky={sticky}>
      <thead>
        <tr>
          {expandable ? (
            <th
              className={`w-6 border-b border-slate-200 pb-2 dark:border-slate-800 ${
                sticky ? STICKY.expanderCorner : ''
              }`}
            />
          ) : null}
          {columns.map((c, i) => (
            <th
              key={c.key}
              onClick={c.sortable ? () => onSort(c.key) : undefined}
              className={`border-b border-slate-200 pb-2 pr-3 ${ALIGN[c.align ?? 'left']} text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 ${
                c.sortable ? 'cursor-pointer select-none hover:text-fairway-600' : ''
              } ${
                sticky
                  ? i === 0
                    ? expandable
                      ? STICKY.cornerAfterExpander
                      : STICKY.corner
                    : STICKY.header
                  : ''
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
        {sorted.map((row) => {
          const open = expanded.has(row.key);
          const canOpen = row.detail !== undefined;
          return (
            <Fragment key={row.key}>
              <tr
                // The row carries an opaque background so that a pinned cell,
                // which uses bg-inherit, has something real to take. Without
                // it the columns sliding underneath show straight through.
                className={`bg-white dark:bg-slate-900 ${row.className ?? ''} ${
                  canOpen
                    ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    : ''
                }`}
                onClick={canOpen ? () => toggle(row.key) : undefined}
              >
                {expandable ? (
                  <td
                    className={`border-b border-slate-100 py-2 dark:border-slate-800/60 ${
                      sticky ? STICKY.expander : ''
                    }`}
                  >
                    {canOpen ? (
                      <button
                        type="button"
                        aria-expanded={open}
                        aria-label={open ? 'Collapse row' : 'Expand row'}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(row.key);
                        }}
                        className="flex h-5 w-5 items-center justify-center text-slate-400 hover:text-fairway-600"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          aria-hidden
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
                        >
                          <path
                            d="M7 4l6 6-6 6"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </td>
                ) : null}
                {columns.map((c, i) => (
                  <td
                    key={c.key}
                    className={`border-b border-slate-100 py-2 pr-3 ${ALIGN[c.align ?? 'left']} dark:border-slate-800/60 ${
                      sticky && i === 0
                        ? expandable
                          ? STICKY.columnAfterExpander
                          : STICKY.column
                        : ''
                    }`}
                  >
                    {row.cells[c.key]}
                  </td>
                ))}
              </tr>
              {open && canOpen ? (
                <tr>
                  <td
                    colSpan={columns.length + (expandable ? 1 : 0)}
                    className="border-b border-slate-100 bg-slate-50/70 p-0 dark:border-slate-800/60 dark:bg-slate-800/30"
                  >
                    <div className="px-3 py-3">{row.detail}</div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
