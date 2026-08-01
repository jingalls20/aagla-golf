import type { EventType, PointsTable } from './types';

/**
 * The league's default points table.
 *
 * Ported from `POINTS_TABLE` / `POINTS_CAP_PLACE` in the Apps Script `Code.gs`.
 * New seasons are seeded with this; existing seasons keep whatever was in force
 * when they were played.
 */
export const DEFAULT_POINTS_TABLE: PointsTable = {
  cap_place: 10,
  event: {
    '1': 0,
    '2': 1,
    '3': 1.5,
    '4': 2,
    '5': 2.5,
    '6': 3,
    '7': 3.5,
    '8': 4,
    '9': 4.5,
    '10': 5,
  },
  major: {
    '1': 0,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
  },
  // Championship events are worth zero season points, always.
  championship: {},
};

/**
 * Points earned for finishing in a given place.
 *
 * Two rules worth stating plainly, because both are easy to get wrong:
 *
 * 1. Places worse than `cap_place` all score the same as `cap_place`. Finishing
 *    14th in a field of 20 costs exactly what finishing 10th costs. This stops
 *    one bad day in a large field from burying a season.
 * 2. A Championship result is always worth 0. The Championship decides its own
 *    winner; it does not move the season standings.
 *
 * @param place 1-based finishing place. Ties share a place (dense ranking).
 */
export function pointsForPlace(
  pointsTable: PointsTable,
  eventType: EventType,
  place: number,
): number {
  if (eventType === 'championship') return 0;

  const table = pointsTable[eventType] ?? pointsTable.event;
  const capped = Math.min(place, pointsTable.cap_place);
  const points = table[String(capped)];

  // A table missing the capped place is a misconfigured season rather than a
  // scoring situation, so fail loudly instead of silently awarding zero --
  // zero is the *best* possible score here, and a silent zero would hand
  // someone an undeserved win.
  if (points === undefined) {
    throw new Error(
      `Points table for "${eventType}" has no entry for place ${capped} ` +
        `(cap_place is ${pointsTable.cap_place}). Check the season's points_table.`,
    );
  }

  return points;
}
