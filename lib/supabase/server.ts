import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Carries the signed-in user's session, so every query it makes is subject to
 * row-level security. This is the client you want essentially everywhere.
 *
 * Must be created per-request rather than module-scoped: it closes over the
 * request's cookies, and a shared instance would serve one user's data to
 * another.
 */
/**
 * Types on the Supabase clients: two things are deliberate.
 *
 * The `<Database>` generic is NOT applied yet. lib/types/database.ts is still a
 * hand-written placeholder, and a type that does not satisfy supabase-js's
 * schema constraint makes overload resolution fall back to a looser signature.
 * Run `npm run db:types` to generate the real one, then add the generic back
 * and the casts in lib/data can go.
 *
 * `setAll`'s parameter is annotated by hand rather than inferred. The library
 * types its `cookies` option as a union of the current and deprecated
 * interfaces, and TypeScript will not contextually type an object literal's
 * methods against a union -- so the parameter comes out as an implicit `any`
 * and fails the build under `strict`. Naming the type is the way around it.
 */
type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // See the note in middleware.ts on this cast.
            cookieStore.set(name, value, options as never);
          }
        } catch {
          // Server Components cannot set cookies. That is fine here: the
          // middleware refreshes the session on every request, so a failure
          // to write back from a render is harmless.
        }
      },
    },
  });
}

/**
 * Supabase client that bypasses row-level security entirely.
 *
 * Only for provisioning that no user is permitted to do — creating a league,
 * seeding a season. Never expose the service role key to the browser, and
 * never reach for this because a policy is inconvenient: if a legitimate
 * action is being blocked, the policy is what needs fixing.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. It is required for provisioning ' +
        'operations and must only ever be read on the server.',
    );
  }

  return createServerClient(SUPABASE_URL, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
