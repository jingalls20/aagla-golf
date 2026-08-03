'use client';

import { useState } from 'react';

/**
 * One player's score cell in the admin entry form: a score field and a DNP
 * checkbox that are mutually exclusive. Checking DNP disables (and so
 * excludes from the submitted FormData) the score field -- the two can't
 * both land on the server, so there's nothing for the action to reconcile.
 */
export function DnpScoreInput({
  playerId,
  defaultScore,
  defaultDnp,
}: {
  playerId: string;
  defaultScore: number | string;
  defaultDnp: boolean;
}) {
  const [dnp, setDnp] = useState(defaultDnp);

  return (
    <div className="flex items-center justify-end gap-3">
      <input
        type="number"
        step="1"
        name={`score_${playerId}`}
        defaultValue={defaultScore}
        placeholder="—"
        disabled={dnp}
        className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
      />
      <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
        <input
          type="checkbox"
          name={`dnp_${playerId}`}
          checked={dnp}
          onChange={(e: { target: { checked: boolean } }) => setDnp(e.target.checked)}
        />
        DNP
      </label>
    </div>
  );
}
