'use client';

import { useState } from 'react';
import { netScoreFor } from '@/lib/domain/scoring';
import { Td, toPar } from '@/components/ui';

/**
 * The editable cells of one player's row on the score entry screen: course
 * differential, the score itself, and a live net score.
 *
 * These three live in one component because the net has to be computed from
 * all of them as you type, and they are the only way to see whether what you
 * just typed is right before it is saved. The net shown here is produced by
 * the same `netScoreFor` the server uses when it recomputes the event, so the
 * preview cannot drift from the real thing.
 *
 * Score and DNP stay mutually exclusive, as before: checking DNP disables the
 * score field, which also removes it from the submitted FormData, so the two
 * can never both reach the server for one player.
 *
 * The per-row Save appears only once something has actually changed. It rides
 * the enclosing form -- HTML forbids nesting one -- and carries an
 * `onlyPlayerId` so the action confines itself to this player. The event is
 * still recomputed in full afterwards, because place and points depend on
 * everyone.
 */
export function ScoreEntryCells({
  playerId,
  defaultScore,
  defaultDiff,
  defaultDnp,
  handicap,
}: {
  playerId: string;
  defaultScore: number | string;
  defaultDiff: number | string;
  defaultDnp: boolean;
  /** Locked, or the projection that would lock on first save. Null when the
   *  player has no prior rounds at all, which the server treats as 0. */
  handicap: number | null;
}) {
  const initialScore = String(defaultScore ?? '');
  const initialDiff = String(defaultDiff ?? '');

  const [score, setScore] = useState(initialScore);
  const [diff, setDiff] = useState(initialDiff);
  const [dnp, setDnp] = useState(defaultDnp);

  const changed = score !== initialScore || diff !== initialDiff || dnp !== defaultDnp;

  const scoreNum = score.trim() === '' ? null : Number(score);
  const diffNum = diff.trim() === '' ? 0 : Number(diff);
  const net =
    !dnp && scoreNum !== null && !Number.isNaN(scoreNum) && !Number.isNaN(diffNum)
      ? netScoreFor({
          trueScore: scoreNum,
          // Mirrors the server: an absent handicap counts as no strokes given.
          fsApplied: handicap ?? 0,
          courseDifferential: diffNum,
        })
      : null;

  return (
    <>
      <Td align="right">
        <input
          type="number"
          step="any"
          name={`diff_${playerId}`}
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          placeholder="0"
          className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm dark:border-slate-800 dark:bg-slate-900"
        />
      </Td>

      <Td align="right" className="bg-fairway-50/60 dark:bg-fairway-900/20">
        <div className="flex items-center justify-end gap-3">
          <input
            type="number"
            step="1"
            name={`score_${playerId}`}
            value={dnp ? '' : score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="—"
            disabled={dnp}
            aria-label="Strokes over par"
            className="w-20 rounded-md border-2 border-fairway-500 bg-white px-2 py-1 text-right text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-fairway-500 disabled:border-slate-200 disabled:bg-slate-100 disabled:font-normal disabled:text-slate-400 dark:bg-slate-900 dark:disabled:border-slate-800 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
          />
          <label className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              name={`dnp_${playerId}`}
              checked={dnp}
              onChange={(e) => setDnp(e.target.checked)}
            />
            DNP
          </label>
          {changed ? (
            <button
              type="submit"
              name="onlyPlayerId"
              value={playerId}
              title="Save this player only. Anything typed on other rows is not saved."
              className="rounded-md bg-fairway-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-fairway-900"
            >
              Save
            </button>
          ) : null}
        </div>
      </Td>

      <Td align="right">
        {net === null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <span className="font-semibold tabular-nums">{toPar(net)}</span>
        )}
      </Td>
    </>
  );
}
