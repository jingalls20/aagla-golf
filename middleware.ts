import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isLeagueSlug } from '@/lib/routing';

const LAST_LEAGUE_COOKIE = 'last_league';

/**
 * Two small pieces of "remember what chapter you were in" behavior, layered
 * on top of the existing auth session refresh:
 *
 *  1. Visiting any `/<slug>` route (or something nested under it) records
 *     that slug as the visitor's last chapter, good for a year.
 *  2. Visiting the root picker redirects straight to that chapter's
 *     dashboard instead of showing the picker -- unless the visitor asked
 *     for the picker via `/?chapters=1` (see the "All chapters" link in the
 *     league layout), which is the escape hatch back to it.
 *
 * This has to live in middleware rather than the pages themselves: Server
 * Components can read cookies but Next 15 won't let them write one during
 * render, and only middleware/route handlers/server actions can.
 */
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === '/' && !searchParams.has('chapters')) {
    const lastLeague = request.cookies.get(LAST_LEAGUE_COOKIE)?.value;
    // Checked on the way out as well as on the way in, so a cookie already
    // poisoned in somebody's browser falls back to the chapter picker
    // instead of following itself somewhere useless.
    if (lastLeague && isLeagueSlug(lastLeague)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/${lastLeague}`;
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  const firstSegment = pathname.match(/^\/([^/]+)/)?.[1];
  if (firstSegment && isLeagueSlug(firstSegment)) {
    response.cookies.set(LAST_LEAGUE_COOKIE, firstSegment, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images and root-level metadata files.
     * The public board is included on purpose: an anonymous visitor still
     * needs a (signed-out) session for row-level security to evaluate
     * consistently.
     *
     * `manifest.webmanifest` is excluded so the manifest fetch doesn't run
     * session refresh on every page load for a file that needs none. The
     * `isLeagueSlug` guard above is the actual correctness fix; this is the
     * saved work.
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
