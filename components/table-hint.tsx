'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The explanatory blurb under a table's title -- useful the first time, noise
 * every time after. Collapsed by default, one click to expand; nothing here
 * needs to be visible for the table itself to make sense.
 */
export function TableHint({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-slate-400 hover:text-fairway-600"
        aria-expanded={open}
      >
        {open ? 'Hide details' : 'What am I looking at?'}
        <span className="ml-1 inline-block text-[9px]">{open ? '▲' : '▼'}</span>
      </button>
      {open ? <p className="mt-1 text-xs text-slate-400">{children}</p> : null}
    </div>
  );
}
