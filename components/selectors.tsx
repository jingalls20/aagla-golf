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
 * Show/hide-inactive-players toggle, carried in the `showInactive` URL
 * search param so it's shareable and survives navigation between tabs.
 */
export function InactiveToggle({ show }: { show: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (show) {
      params.delete('showInactive');
    } else {
      params.set('showInactive', '1');
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
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
