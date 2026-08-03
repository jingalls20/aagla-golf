import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Plain POST endpoint rather than a Server Action -- the sign-out button in
 * auth-bar.tsx is a bare `<form method="post">`, so this works with zero
 * client-side JavaScript.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url));
}
