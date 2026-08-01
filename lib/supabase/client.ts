import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/**
 * Supabase client for Client Components.
 *
 * Uses the publishable key, which is safe to ship to the browser: every read
 * and write it makes is still governed by row-level security. Prefer the
 * server client where you can -- this exists for interactive things like
 * sign-in and realtime subscriptions.
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
export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
}
