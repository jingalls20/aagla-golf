import type { ReactNode } from 'react';

/**
 * A collapsible section.
 *
 * Built on native `<details>`/`<summary>` rather than React state, which keeps
 * this a server component: no hydration, no JavaScript shipped, and it still
 * works with the keyboard and with find-in-page in browsers that expand
 * closed details to reveal a match. The open/closed chevron is pure CSS off
 * the `[open]` attribute.
 *
 * Matches the visual weight of `Card` from ui.tsx so a page can mix the two
 * without the collapsible ones looking like a different component library.
 */
export function Collapsible({
  title,
  aside,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  /** Small right-aligned note in the header -- a count, a date range. */
  aside?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 20 20"
          aria-hidden
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-[[open]]:rotate-90"
        >
          <path
            d="M7 4l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h2>
        {aside ? <span className="ml-auto text-xs text-slate-400">{aside}</span> : null}
      </summary>
      <div className="border-t border-slate-100 p-4 dark:border-slate-800">
        {children}
      </div>
    </details>
  );
}
