'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

/**
 * A `<select>`-based navigation control -- picking an option pushes a new
 * URL. Replaces link-strips (year tabs, an event list) that read fine on a
 * desktop but eat a lot of vertical space on a phone.
 *
 * Takes a pre-built `hrefs` map (value -> destination URL) rather than a
 * `hrefFor` callback. A Server Component page cannot hand a function prop to
 * a Client Component -- React can't serialize it across that boundary -- so
 * the page builds the small map of plain strings up front instead.
 */
export function NavSelect({
  value,
  options,
  hrefs,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  hrefs: Record<string, string>;
  label?: string;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 text-sm">
      {label ? (
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
      ) : null}
      <select
        value={value}
        onChange={(e: { target: { value: string } }) => {
          const href = hrefs[e.target.value];
          if (href) router.push(href);
        }}
        className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Show/hide-inactive-players toggle.
 *
 * Sticky across tabs and dropdown changes: every page that reads this falls
 * back to a `showInactive` cookie whenever the URL doesn't say one way or the
 * other (see each page's `resolveShowInactive`), and the nav tabs / season
 * dropdowns never carry this param themselves -- they don't need to, the
 * cookie already speaks for them. The current page's own URL still gets an
 * explicit `1` or `0` on toggle (never just deleted) so a shared/bookmarked
 * link is unambiguous even if the visitor's cookie disagrees.
 */
export function InactiveToggle({ show }: { show: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const next = !show;
    document.cookie = next
      ? 'showInactive=1; path=/; max-age=31536000'
      : 'showInactive=0; path=/; max-age=31536000';
    const params = new URLSearchParams(searchParams.toString());
    params.set('showInactive', next ? '1' : '0');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={show}
        onChange={toggle}
        className="h-3.5 w-3.5 rounded border-slate-300 text-fairway-600 focus:ring-fairway-500"
      />
      Show inactive players
    </label>
  );
}

/**
 * Records-only filter: recompute every board over current members alone.
 *
 * Deliberately a separate control from `InactiveToggle` above, with its own
 * cookie and its own default, because the two screens want opposite things.
 * On the standings a retired player is clutter, so those hide inactives
 * unless asked. A record book is mostly *made* of people who have stopped
 * playing -- the longest careers and the lowest rounds belong to them -- so
 * hiding them by default would quietly delete the history the page exists to
 * show. Here the full board is the default and this is the opt-in.
 *
 * Sharing one cookie between the two would mean ticking "show inactive" on
 * the standings silently rewrote the record book, which is not a connection
 * anybody would predict from the labels.
 */
export function ActiveOnlyToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const next = !on;
    document.cookie = next
      ? 'recordsActiveOnly=1; path=/; max-age=31536000'
      : 'recordsActiveOnly=0; path=/; max-age=31536000';
    const params = new URLSearchParams(searchParams.toString());
    params.set('activeOnly', next ? '1' : '0');
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-slate-500">
      <input
        type="checkbox"
        checked={on}
        onChange={toggle}
        className="h-3.5 w-3.5 rounded border-slate-300 text-fairway-600 focus:ring-fairway-500"
      />
      Current members only
    </label>
  );
}
