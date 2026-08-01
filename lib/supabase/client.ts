import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';

/**
 * Supabase client for Client Components.
 *
 * Uses the publishable key, which is safe to ship to the browser: every read
 * and write it makes is still governed by row-level security. Prefer the
 * server client where you can -- this exists for interactive things like
 * sign-in and realtime subscriptions.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
