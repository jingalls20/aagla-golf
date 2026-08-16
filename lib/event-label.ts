import type { EventType } from '@/lib/domain/types';

/**
 * The name to print above a column of the events grid.
 *
 * Two of this season's events are named "Willows Run (Major)" and
 * "Washington National (Championship)", because Seattle disambiguated its
 * title events by hand when they were entered. The grid already prints the
 * event's type on its own line underneath, so carrying the suffix as well
 * said it twice and pushed those two headers to three lines each -- which
 * is most of why seven events would not fit across the page.
 *
 * Stripping it is presentation only. The event keeps its name everywhere
 * else, including the Discord recaps and the records board, where there is
 * room for it and no type label beside it.
 */
export function eventHeaderLabel(e: {
  name: string | null;
  legacyId?: number | null;
  sequence: number;
  eventType: EventType;
}): string {
  const name = e.name?.trim();
  if (!name) return `#${e.legacyId ?? e.sequence}`;
  return name.replace(/\s*\((?:Major|Championship)\)\s*$/i, '').trim() || name;
}
