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
 * One cheap read a day is enough to reset the idle clock. It is scheduled in
 * vercel.json.
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
    // `head: true` asks for the count and no rows at all: the smallest round
    // trip that still proves the database answered.
    const { count, error } = await supabase
      .from('leagues')
      .select('id', { count: 'exact', head: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      chapters: count ?? 0,
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
