import { cookies } from 'next/headers';

/**
 * Resolve the "show inactive players" preference for a page render.
 *
 * The URL param wins when present -- an explicit `1` or `0`, written by
 * `InactiveToggle` on every toggle -- so a shared or bookmarked link is
 * unambiguous. Absent that (the common case: arriving via a nav tab or a
 * season dropdown, neither of which carry this param), fall back to the
 * `showInactive` cookie the toggle also sets, so the preference is sticky
 * across pages instead of resetting on every navigation.
 */
export async function resolveShowInactive(param: string | undefined): Promise<boolean> {
  if (param === '1') return true;
  if (param === '0') return false;
  const store = await cookies();
  return store.get('showInactive')?.value === '1';
}
