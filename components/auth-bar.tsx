import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

/**
 * Sign-in status, shown in the header of every screen except the public
 * board (that route stays chrome-free on purpose -- it's an iframe embed).
 *
 * Entirely server-rendered: the signed-out state is a plain `<Link>`, the
 * signed-in state's sign-out control is a bare `<form method="post">` to
 * /auth/signout. No client component, no hydration, nothing to get wrong.
 */
export async function AuthBar({ next }: { next?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className="max-w-[12rem] truncate">{user.email}</span>
      <span aria-hidden>·</span>
      <form action="/auth/signout" method="post">
        <button type="submit" className="hover:text-slate-600 hover:underline">
          Sign out
        </button>
      </form>
    </div>
  );
}
