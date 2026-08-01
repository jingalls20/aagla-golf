import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/**
 * Refreshes the auth session on every request.
 *
 * Supabase access tokens are short-lived. Without this, a Server Component
 * would eventually render for a user whose token has expired and quietly show
 * them a signed-out view mid-session.
 *
 * The `getUser()` call is deliberate and must not be replaced with
 * `getSession()`: only `getUser()` revalidates the token against the auth
 * server, and only the response object returned here carries the refreshed
 * cookies back to the browser.
 */
/**
 * NOTE: the `<Database>` generic is intentionally NOT applied yet.
 *
 * lib/types/database.ts is still a hand-written placeholder, and a type that
 * does not satisfy supabase-js's schema constraint makes overload resolution
 * fall back to a looser signature -- which silently strips the types off the
 * cookie callbacks below and fails the build with "implicitly has an 'any'
 * type". Running `npm run db:types` generates the real thing; add the generic
 * back at that point and the queries in lib/data can drop their casts.
 */
/**
 * The shape `@supabase/ssr` hands to `setAll`.
 *
 * Annotated by hand rather than inferred. The library types its `cookies`
 * option as a union of the current and deprecated interfaces, and TypeScript
 * will not contextually type an object literal's methods against a union --
 * so `setAll(cookiesToSet)` comes out as an implicit `any` and fails the build
 * under `strict`. Naming the type is the documented way around it.
 */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            // `as never` because Supabase's cookie options and Next's
            // ResponseCookie disagree on the exact literal types of fields
            // like sameSite, while being structurally interchangeable at
            // runtime. Localised here rather than loosened globally.
            response.cookies.set(name, value, options as never);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}
