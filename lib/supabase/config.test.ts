import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SUPABASE_ANON_KEY,
  SUPABASE_TIMEOUT_MS,
  isTokenRejection,
  sessionTolerantFetch,
  timeoutFetch,
} from './config';

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

/**
 * These cover the second outage: Supabase minted a session token whose
 * issued-at timestamp sat a second ahead of the database server's clock, the
 * database refused it, and -- because the resilience work above treated every
 * query failure as "unreachable" -- a chapter page died rather than showing
 * the signed-out view that any visitor would have got.
 */
describe('isTokenRejection', () => {
  it('recognises the refusals that are about credentials', () => {
    expect(isTokenRejection(401, '{"message":"JWT issued at future"}')).toBe(true);
    expect(isTokenRejection(401, '{"message":"JWT expired"}')).toBe(true);
    expect(isTokenRejection(401, '{"code":"PGRST301"}')).toBe(true);
  });

  it('leaves every other failure alone', () => {
    // A 401 that is not about a token, and errors that are about the
    // database rather than the caller, must keep failing as they did.
    expect(isTokenRejection(401, '{"message":"no API key found"}')).toBe(false);
    expect(isTokenRejection(403, '{"message":"JWT expired"}')).toBe(false);
    expect(isTokenRejection(500, '{"message":"database is starting up"}')).toBe(false);
    expect(isTokenRejection(200, '[]')).toBe(false);
  });
});

describe('sessionTolerantFetch', () => {
  const original = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = original;
  });

  function respond(...responses: Response[]) {
    const calls: RequestInit[] = [];
    let i = 0;
    globalThis.fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      calls.push(init ?? {});
      return Promise.resolve(responses[Math.min(i++, responses.length - 1)]);
    }) as unknown as typeof fetch;
    return calls;
  }

  it('passes a good response through untouched', async () => {
    const calls = respond(new Response('[]', { status: 200 }));
    const out = await sessionTolerantFetch('https://example.test');
    expect(out.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('retries a refused token as a signed-out visitor', async () => {
    const calls = respond(
      new Response('{"message":"JWT issued at future"}', { status: 401 }),
      new Response('[{"slug":"aagla-seattle"}]', { status: 200 }),
    );
    const out = await sessionTolerantFetch('https://example.test', {
      headers: { Authorization: 'Bearer stale-user-token' },
    });

    expect(out.status).toBe(200);
    expect(calls).toHaveLength(2);
    const retry = new Headers(calls[1].headers);
    expect(retry.get('Authorization')).toBe(`Bearer ${SUPABASE_ANON_KEY}`);
  });

  it('never retries a write, which must fail loudly', async () => {
    // Quietly re-sending an admin's save without their identity would either
    // be refused confusingly or, worse, do something nobody is accountable
    // for.
    const calls = respond(new Response('{"message":"JWT expired"}', { status: 401 }));
    const out = await sessionTolerantFetch('https://example.test', { method: 'POST' });
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('does not retry a 401 that is not about the token', async () => {
    const calls = respond(
      new Response('{"message":"no API key found"}', { status: 401 }),
    );
    const out = await sessionTolerantFetch('https://example.test');
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  it('returns the second refusal rather than retrying forever', async () => {
    const calls = respond(
      new Response('{"message":"JWT issued at future"}', { status: 401 }),
      new Response('{"message":"JWT issued at future"}', { status: 401 }),
    );
    const out = await sessionTolerantFetch('https://example.test');
    expect(out.status).toBe(401);
    expect(calls).toHaveLength(2);
  });
});
