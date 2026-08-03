'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Google sign-in only. This used to also offer an email magic link, but
 * Supabase's default (free-plan, no custom SMTP) email flow routes through
 * its own hosted verification step and issues a PKCE code that only redeems
 * cleanly in the same browser session that requested it -- opening the link
 * in a different browser/app (or after a link-safety scanner has already
 * visited it) reliably breaks the sign-in. Google's OAuth round trip stays in
 * one browser session end to end, so it doesn't have that failure mode.
 *
 * Plain props only (`next` is a string, not a callback) -- this is a Client
 * Component and its Server Component parent can't hand it a function; see the
 * note in selectors.tsx for why that matters here.
 */
export function LoginForm({ next }: { next: string | null }) {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleGoogle() {
    setLoading(true);
    const supabase = createClient();
    const redirectPath = `/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${redirectPath}`,
      },
    });
    if (error) {
      setLoading(false);
      setErrorMessage(error.message);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
          <path
            fill="#4285F4"
            d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h11.9c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.9 6.5-9.6 6.5-16.6z"
          />
          <path
            fill="#34A853"
            d="M24 46c6 0 11-2 14.6-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.5 2.1-5.8 0-10.6-3.9-12.4-9.1H4.3v5.7C7.9 41.1 15.4 46 24 46z"
          />
          <path
            fill="#FBBC05"
            d="M11.6 28.1c-.5-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3C2.8 17.1 2 20.5 2 24s.8 6.9 2.3 9.8z"
          />
          <path
            fill="#EA4335"
            d="M24 10.8c3.3 0 6.2 1.1 8.5 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 6.9 4.3 14.2l7.3 5.7c1.8-5.2 6.6-9.1 12.4-9.1z"
          />
        </svg>
        {loading ? 'Redirecting…' : 'Continue with Google'}
      </button>
      {errorMessage ? <p className="mt-2 text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  );
}
