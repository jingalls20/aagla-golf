/**
 * Is this first path segment a league slug?
 *
 * Lives here rather than inside `middleware.ts` so it can be tested: the
 * middleware itself needs a running request to exercise, but the rule it
 * depends on is a pure string question and deserves to be pinned down.
 *
 * Two kinds of thing are not chapters. Reserved routes we own -- login,
 * auth, api -- and anything with a dot in it, which is a file being served
 * from the root rather than a page.
 *
 * The dot rule was written in response to a real bug. Adding
 * `/manifest.webmanifest` meant the browser fetched it on page load, the
 * middleware recorded `manifest.webmanifest` as the visitor's last chapter,
 * and their next visit to `/` redirected them to a page of JSON. A list of
 * known routes could never have prevented that, because the whole problem
 * was a route nobody had thought of yet. Matching the shape does.
 */
const RESERVED_FIRST_SEGMENTS = new Set(['login', 'auth', 'api']);

export function isLeagueSlug(segment: string): boolean {
  if (segment.length === 0) return false;
  if (segment.includes('.')) return false;
  return !RESERVED_FIRST_SEGMENTS.has(segment);
}
