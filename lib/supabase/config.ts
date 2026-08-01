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
