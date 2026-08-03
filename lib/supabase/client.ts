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
 * The `<Database>` generic is intentionally not applied yet -- see the note in
 * server.ts. Run `npm run db:types` and it can come back.
 */
export function createClient() {
  return createBrowserClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
  );
}
