/**
 * Supabase connection details.
 *
 * These two values are deliberately checked in with defaults. Both are shipped
 * to every visitor's browser by design — the publishable key identifies the
 * project, it does not authorise anything. Every read and write it makes is
 * still evaluated by row-level security, which is where the actual access
 * control lives (see supabase/migrations/0003_rls.sql).
 *
 * The service role key is the one that must never appear here, or anywhere
 * else in this repo. It bypasses row-level security completely.
 *
 * Environment variables still win when set, so a fork or a second environment
 * can point somewhere else without touching code.
 */
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://fxkduqairawxmhxatpxd.supabase.co';

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_k5gB6XikOVgPbtNJ4LALNA_UMVATGkU';

/**
 * How long any single Supabase request may take before it is abandoned.
 *
 * This exists because of a real outage. The database is on a plan that
 * pauses itself after about a week without queries; nobody visited for two
 * weeks, it paused, and every request to the app then hung in middleware
 * until Vercel killed it at 25 seconds and returned a 504. The site did not
 * degrade -- it stopped, including the pages that need no database at all.
 *
 * Six seconds is far longer than a healthy query (the slowest real page here
 * runs three of them and returns well inside a second) and far shorter than
 * the platform's patience, so a dead database now produces a fast error that
 * something can be done about instead of a hang that nothing can.
 */
export const SUPABASE_TIMEOUT_MS = 6000;

/**
 * `fetch` with a deadline, for the Supabase clients.
 *
 * Supabase's client takes a `global.fetch`, so wrapping it here covers every
 * query the app makes -- middleware, Server Components, actions -- from one
 * place rather than asking each call site to remember.
 *
 * An abort surfaces as a normal fetch rejection, which supabase-js reports
 * the way it reports any network failure, so nothing downstream needs to
 * know this happened.
 */
export function timeoutFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Respect a caller's own signal as well as the deadline: whichever fires
  // first wins, and a caller that aborts is not held open by our timer.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}
