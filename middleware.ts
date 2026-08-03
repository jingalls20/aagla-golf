import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Never treated as a league slug, so visiting them doesn't overwrite the cookie. */
const RESERVED_FIRST_SEGMENTS = new Set(['login', 'auth', 'api']);

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
    if (lastLeague) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = `/${lastLeague}`;
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  const firstSegment = pathname.match(/^\/([^/]+)/)?.[1];
  if (firstSegment && !RESERVED_FIRST_SEGMENTS.has(firstSegment)) {
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
     * Everything except static assets and images. The public board is
     * included on purpose: an anonymous visitor still needs a (signed-out)
     * session for row-level security to evaluate consistently.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
