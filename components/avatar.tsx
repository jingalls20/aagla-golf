/**
 * Player thumbnail.
 *
 * Renders a real photo when `photoUrl` is set, otherwise a colored initials
 * badge. The color is derived from the name itself (a small hash into a fixed
 * palette) so a given player looks the same everywhere without storing a
 * color anywhere -- this is deliberately the *only* thing that stands in for
 * a photo today, so that wiring up real uploads later is an upload screen
 * layered on top, not a layout change.
 */

const PALETTE = [
  'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-lime-100 text-lime-700 dark:bg-lime-900/50 dark:text-lime-200',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-200',
  'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-200',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-200',
  'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-200',
] as const;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paletteFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

const SIZES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-base',
} as const;

export function Avatar({
  name,
  photoUrl,
  size = 'sm',
}: {
  name: string;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
}) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- external, variable-origin URLs
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`inline-block shrink-0 rounded-full object-cover align-middle ${SIZES[size]}`}
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold align-middle ${SIZES[size]} ${paletteFor(name)}`}
      aria-hidden
    >
      {initialsOf(name)}
    </span>
  );
}
