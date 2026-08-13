import { describe, expect, it } from 'vitest';
import { isLeagueSlug } from './routing';

describe('isLeagueSlug', () => {
  it('accepts a chapter slug', () => {
    expect(isLeagueSlug('seattle')).toBe(true);
    expect(isLeagueSlug('iowa')).toBe(true);
  });

  it('rejects the routes the app reserves for itself', () => {
    for (const s of ['login', 'auth', 'api']) expect(isLeagueSlug(s)).toBe(false);
  });

  it('rejects root-level files, which is the bug this exists for', () => {
    // The browser fetches this on every page load. Recording it as the
    // visitor's chapter sent the next visit to `/` into a page of JSON.
    expect(isLeagueSlug('manifest.webmanifest')).toBe(false);
  });

  it('rejects any other dotted file added later', () => {
    for (const s of ['robots.txt', 'sitemap.xml', 'favicon.ico', 'sw.js']) {
      expect(isLeagueSlug(s)).toBe(false);
    }
  });

  it('rejects an empty segment', () => {
    expect(isLeagueSlug('')).toBe(false);
  });
});
