/**
 * What a Discord post attempt did, in words an admin can act on.
 *
 * Shared between the two screens that can post a recap -- score entry and
 * the season page -- so the same failure never gets described two different
 * ways depending on which button was pressed. Keyed by the `posted` value
 * the action redirects back with; see lib/actions/recaps.ts.
 */
export const POSTED_MESSAGE: Record<string, { tone: 'good' | 'bad'; text: string }> = {
  ok: { tone: 'good', text: 'Posted to Discord.' },
  empty: {
    tone: 'bad',
    text: 'Nothing to post yet — no scores have been recorded for that one.',
  },
  missing: { tone: 'bad', text: 'That event no longer exists.' },
  unconfigured: {
    tone: 'bad',
    text: 'No Discord webhook is configured yet. See the note below.',
  },
  rejected: {
    tone: 'bad',
    text: 'Discord rejected the webhook. It may have been deleted or regenerated.',
  },
  unreachable: {
    tone: 'bad',
    text: 'Could not reach Discord. Try again in a moment.',
  },
};
