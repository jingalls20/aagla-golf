import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Where the magic-link email actually points, in practice.
 *
 * The `@supabase/ssr` browser client requests the PKCE flow by default, so
 * Supabase's hosted verification step (the default email template's
 * `{{ .ConfirmationURL }}`, which we can't edit without custom SMTP on the
 * free plan) redirects back here with a `?code=...`, not the `token_hash` +
 * `type` pair `/auth/confirm` expects. `/auth/confirm` is kept for later --
 * upgrading to custom SMTP and pointing the template at it is a drop-in
 * swap -- but this is the route that's actually reachable today.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`);
}
