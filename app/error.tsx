'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * What a visitor sees when a page could not be rendered.
 *
 * Written for the failure that actually happened rather than for errors in
 * general: the database pauses itself after a week or so without queries, and
 * when it does, every page here has nothing to draw. The honest thing to say
 * is that the scores are temporarily out of reach and to try again shortly --
 * not "no chapters available", which is what an empty result would have
 * rendered, and not a 404, which is what a missing chapter would have.
 *
 * `reset` re-runs the render. That is genuinely useful here: a database
 * waking up takes a couple of minutes, so the second or third press often
 * just works.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Goes to the platform's runtime logs, which is where this was finally
    // diagnosed from last time.
    console.error('Page render failed:', error);
  }, [error]);

  const unavailable = error.name === 'DatabaseUnavailableError';

  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">
        {unavailable ? 'The scores are offline for a moment' : 'Something went wrong'}
      </h1>
      <p className="mx-auto mt-3 max-w-prose text-sm leading-relaxed text-slate-500">
        {unavailable
          ? 'The database this runs on goes to sleep when nobody has visited for a ' +
            'while, and it takes a minute or two to wake up. Nothing has been lost. ' +
            'Try again shortly.'
          : 'That page could not be loaded. Trying again usually sorts it.'}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
        >
          Try again
        </button>
        <Link
          href="/?chapters=1"
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          All chapters
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[10px] uppercase tracking-wider text-slate-300">
          reference {error.digest}
        </p>
      ) : null}
    </main>
  );
}
