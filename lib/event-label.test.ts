import { describe, expect, it } from 'vitest';
import { eventHeaderLabel } from './event-label';

const e = (over: Partial<Parameters<typeof eventHeaderLabel>[0]> = {}) => ({
  name: 'Grandview',
  legacyId: null,
  sequence: 4,
  eventType: 'event' as const,
  ...over,
});

describe('eventHeaderLabel', () => {
  it('leaves an ordinary name alone', () => {
    expect(eventHeaderLabel(e())).toBe('Grandview');
  });

  it('drops a trailing kind, which the column already prints underneath', () => {
    expect(eventHeaderLabel(e({ name: 'Willows Run (Major)' }))).toBe('Willows Run');
    expect(eventHeaderLabel(e({ name: 'Washington National (Championship)' }))).toBe(
      'Washington National',
    );
  });

  it('is not fooled by case or spacing', () => {
    expect(eventHeaderLabel(e({ name: 'Otter Creek  (CHAMPIONSHIP)' }))).toBe(
      'Otter Creek',
    );
  });

  it('keeps a parenthetical that is not a kind', () => {
    expect(eventHeaderLabel(e({ name: 'Blank Park (back nine)' }))).toBe(
      'Blank Park (back nine)',
    );
  });

  it('keeps the name when stripping would leave nothing', () => {
    expect(eventHeaderLabel(e({ name: '(Major)' }))).toBe('(Major)');
  });

  it('falls back to the number when an event has no name', () => {
    expect(eventHeaderLabel(e({ name: null, sequence: 9 }))).toBe('#9');
    expect(eventHeaderLabel(e({ name: '   ', legacyId: 3 }))).toBe('#3');
  });
});
