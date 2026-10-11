import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Keeps the database awake.
 *
 * The project is on a plan that pauses itself after roughly a week without
 * queries. In September it did exactly that, and because the session refresh
 * in middleware runs before every page, the whole site returned 504s until
 * somebody noticed and woke it by hand. A golf league is quiet for weeks at
 * a time in the off-season, so that was not a one-off waiting to happen --
 * it was the normal rhythm of the thing.
 *
 * One cheap read a day turned out NOT to be enough. Supabase pauses a free
 * project that has not had "sufficient user database activity" over the
 * previous week, and their guidance is "a few user requests to the database
 * each day" -- a single request sits right on the line. A warning email
 * arrived while the daily cron was firing perfectly: the logs showed exactly
 * one request in twenty-four hours, which was it.
 *
 * So this now makes a handful of small reads rather than one, and it is
 * scheduled from two independent places -- vercel.json and a GitHub Actions
 * workflow -- because a league in its off-season has no human traffic at all
 * for weeks, and a single scheduler is a single point of failure for the
 * whole site.
 *
 * Deliberately unauthenticated. It reads nothing a visitor to the public
 * scoreboard cannot already read, writes nothing, and takes a single indexed
 * count -- so a secret would buy no protection worth the configuration it
 * costs. `CRON_SECRET` is honoured if it happens to be set, for anyone who
 * disagrees.
 */

// Must not be cached: a cached response would return 200 forever without
// ever touching the database, which is the one thing this route exists to do.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get('authorization');
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
  }

  const started = Date.now();
  try {
    const supabase = await createClient();

    // Several separate round trips rather than one. Each is a `head` read --
    // the count and no rows at all, the smallest request that still proves
    // the database answered -- but they arrive as distinct requests, which
    // is what Supabase's idle check is counting. Sequential, not parallel:
    // the point is to look like a few people using the app, and the whole
    // thing still finishes well inside a second.
    const tables = ['leagues', 'seasons', 'players', 'events', 'scores'];
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('id', { count: 'exact', head: true });
      if (error) throw new Error(`${table}: ${error.message}`);
      counts[table] = count ?? 0;
    }

    return NextResponse.json({
      ok: true,
      counts,
      requests: tables.length,
      ms: Date.now() - started,
    });
  } catch (cause) {
    // 503 rather than 500: this is the database being unreachable, and a
    // monitor watching this route should read it as "asleep or down" rather
    // than as a bug in the app.
    return NextResponse.json(
      {
        ok: false,
        error: cause instanceof Error ? cause.message : String(cause),
        ms: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
