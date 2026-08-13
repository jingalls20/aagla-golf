import 'server-only';

/**
 * Posting to the league's Discord channel.
 *
 * A Discord webhook URL is a bearer credential: anyone holding it can post
 * to that channel as the league, forever, with no further authentication.
 * So it lives in an environment variable, it is only ever read on the
 * server, and it is never returned to a caller -- not in a response, not in
 * an error message, not in a log line. `server-only` at the top of this file
 * makes importing it from a Client Component a build error rather than a
 * quiet leak.
 *
 * Which channel is decided per chapter. Iowa and Seattle have their own
 * Discords, and a Seattle recap landing in the Iowa channel would be worse
 * than not posting at all.
 */

export type DiscordResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'rejected' | 'unreachable'; detail: string };

/**
 * The env var holding a chapter's own webhook, when it has one.
 *
 * Keyed by slug so giving a chapter its own channel later is a Vercel
 * setting rather than a deploy: `DISCORD_WEBHOOK_IOWA`,
 * `DISCORD_WEBHOOK_SEATTLE`.
 */
export function webhookEnvName(slug: string): string {
  return `DISCORD_WEBHOOK_${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
}

/**
 * The league-wide fallbacks, tried in order after the chapter-specific one.
 *
 * Both names are accepted rather than one, because there is no good reason
 * to make somebody re-enter a credential to satisfy a naming preference.
 * A per-chapter variable still wins if it exists, so starting with one
 * shared channel and splitting later needs no change here.
 */
const LEAGUE_WIDE_ENV_NAMES = ['DISCORD_WEBHOOK_URL_AAGLA', 'DISCORD_WEBHOOK_URL'];

/** Every variable consulted for a chapter, best match first. */
export function webhookEnvCandidates(slug: string): string[] {
  return [webhookEnvName(slug), ...LEAGUE_WIDE_ENV_NAMES];
}

function webhookFor(slug: string): string | null {
  for (const name of webhookEnvCandidates(slug)) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return null;
}

/** Whether posting is available, without revealing anything about the URL. */
export function discordConfigured(slug: string): boolean {
  return webhookFor(slug) !== null;
}

/**
 * Send one message.
 *
 * Never throws. A failed post is a thing the admin screen needs to show
 * calmly -- the recap is not so important that a Discord outage should take
 * down the page that generates it.
 */
export async function postToDiscord(
  slug: string,
  content: string,
): Promise<DiscordResult> {
  const url = webhookFor(slug);
  if (!url) {
    return {
      ok: false,
      reason: 'unconfigured',
      detail: `No Discord webhook is set. Add one of ${webhookEnvCandidates(slug).join(', ')} to the aagla-golf project in Vercel and redeploy.`,
    };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        // Belt and braces. The recap is generated from names already public
        // on the board, but a player called "everyone" should still not be
        // able to ping the whole server.
        allowed_mentions: { parse: [] },
      }),
    });

    if (!res.ok) {
      // Discord's body can echo the request, so only the status is reported
      // back -- a 401 here means the webhook was deleted or revoked, and the
      // admin needs to know that much and no more.
      return {
        ok: false,
        reason: 'rejected',
        detail:
          res.status === 401 || res.status === 403 || res.status === 404
            ? 'Discord rejected the webhook. It may have been deleted or regenerated — create a new one and update the environment variable.'
            : `Discord returned ${res.status}. Try again in a moment.`,
      };
    }

    return { ok: true };
  } catch {
    // The URL could appear in a network error's message, so the original is
    // deliberately swallowed rather than passed through.
    return {
      ok: false,
      reason: 'unreachable',
      detail: 'Could not reach Discord. Check the connection and try again.',
    };
  }
}
