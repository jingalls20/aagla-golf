'use client';

import { useRef, useState } from 'react';

/**
 * The event rows inside the season builder's "add events" form. Field names
 * are indexed (`event_name_0`, `event_name_1`, ...) to match how
 * `addEvents` in lib/actions/admin.ts parses them, with a hidden `rowCount`
 * telling the action how many indices to look for. A blank name means an
 * unused spare row -- the action skips it rather than erroring, so there's
 * no need to trim empty rows before submitting.
 */
export function AddEventsForm() {
  const nextKey = useRef(0);
  const makeRow = () => ({ key: nextKey.current++ });
  const [rows, setRows] = useState(() => [makeRow(), makeRow(), makeRow()]);

  function addRow() {
    setRows((r) => [...r, makeRow()]);
  }
  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((row) => row.key !== key) : r));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="rowCount" value={rows.length} />
      {rows.map((row, i) => (
        <div
          key={row.key}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
        >
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">Name</span>
            <input
              name={`event_name_${i}`}
              placeholder="e.g. Spring Open"
              className="w-40 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">Type</span>
            <select
              name={`event_type_${i}`}
              defaultValue="event"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="event">Event</option>
              <option value="major">Major</option>
              <option value="championship">Championship</option>
            </select>
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Date (optional)
            </span>
            <input
              type="date"
              name={`event_date_${i}`}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Course (optional)
            </span>
            <input
              name={`event_course_${i}`}
              className="w-36 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => removeRow(row.key)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-fairway-500 hover:text-fairway-600 dark:border-slate-700"
      >
        + Add another event
      </button>
    </div>
  );
}
