import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPABASE_TIMEOUT_MS, timeoutFetch } from './config';

/**
 * These cover the outage of September 2026, where a paused database held
 * every request open until the platform killed it at 25 seconds. The fix is
 * a deadline, and the thing worth pinning is not that it fires but that it
 * does not fire on healthy traffic and does not leak timers.
 */
describe('timeoutFetch', () => {
  const original = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = original;
  });

  it('passes a normal response straight through', async () => {
    const response = new Response('ok');
    globalThis.fetch = vi.fn().mockResolvedValue(response);

    await expect(timeoutFetch('https://example.test')).resolves.toBe(response);
  });

  it('gives the request a signal even when the caller passed none', async () => {
    const spy = vi.fn().mockResolvedValue(new Response('ok'));
    globalThis.fetch = spy;

    await timeoutFetch('https://example.test');

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('aborts a request that outlives the deadline', async () => {
    let seen: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      // A request that never settles, which is exactly what a paused
      // database produced.
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    void timeoutFetch('https://example.test');
    expect(seen?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(SUPABASE_TIMEOUT_MS + 1);
    expect(seen?.aborted).toBe(true);
  });

  it('does not abort a request that finishes in time', async () => {
    let seen: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return Promise.resolve(new Response('ok'));
    }) as unknown as typeof fetch;

    await timeoutFetch('https://example.test');
    // The timer is cleared on settle, so advancing past the deadline must
    // not retroactively abort a request that already came back. Without the
    // `finally`, every healthy request would leave a live timer behind.
    await vi.advanceTimersByTimeAsync(SUPABASE_TIMEOUT_MS + 1);
    expect(seen?.aborted).toBe(false);
  });

  it("honours a caller's own signal, aborting early", async () => {
    let seen: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const caller = new AbortController();
    void timeoutFetch('https://example.test', { signal: caller.signal });
    expect(seen?.aborted).toBe(false);

    caller.abort();
    expect(seen?.aborted).toBe(true);
  });

  it('honours a caller signal that was already aborted', async () => {
    let seen: AbortSignal | undefined;
    globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      seen = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    void timeoutFetch('https://example.test', { signal: AbortSignal.abort() });
    expect(seen?.aborted).toBe(true);
  });

  it('leaves the deadline comfortably clear of a healthy query', () => {
    // Slow enough that a real page (three queries, well inside a second)
    // never trips it; fast enough to beat the platform's 25-second kill.
    expect(SUPABASE_TIMEOUT_MS).toBeGreaterThan(2000);
    expect(SUPABASE_TIMEOUT_MS).toBeLessThan(20000);
  });
});
