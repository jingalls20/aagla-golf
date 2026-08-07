import Link from 'next/link';

export default function AuthErrorPage() {
  return (
    <main className="mx-auto max-w-sm px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">Sign-in link didn&rsquo;t work</h1>
      <p className="mt-2 text-sm text-slate-500">
        That link may have expired or already been used. Sign-in links are good for one
        use.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
      >
        Try again
      </Link>
    </main>
  );
}
