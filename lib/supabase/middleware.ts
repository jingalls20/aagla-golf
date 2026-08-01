import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/types/database';
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
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();

  return response;
}
