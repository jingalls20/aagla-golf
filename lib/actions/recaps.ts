'use server';

import { redirect } from 'next/navigation';
import { isLeagueAdmin } from '@/lib/data/admin';
import { eventRecapInput, seasonRecapInput } from '@/lib/data/recaps';
import { eventRecap, fitToDiscord, seasonRecap } from '@/lib/domain/recap';
import { postToDiscord } from '@/lib/discord';

/**
 * Posting a recap to the league's Discord.
 *
 * Two rules hold this together. The form submits an id, never text, so the
 * only thing that can reach Discord is a recap this server generated from
 * the scores a moment earlier. And the result comes back as a query
 * parameter rather than a thrown error, because a Discord outage should
 * leave the admin looking at a sentence explaining it, not a stack trace on
 * the screen they use to run the league.
 */

function back(slug: string, seasonId: string, outcome: string): never {
  redirect(`/${slug}/admin/seasons/${seasonId}?posted=${encodeURIComponent(outcome)}`);
}

export async function postEventRecap(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const leagueName = String(formData.get('leagueName') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');

  if (!leagueId || !slug || !seasonId || !eventId) redirect(`/${slug}`);
  if (!(await isLeagueAdmin(leagueId))) redirect(`/${slug}`);

  const input = await eventRecapInput(leagueId, leagueName, eventId);
  if (!input) back(slug, seasonId, 'missing');

  const text = eventRecap(input);
  // No played rounds means no recap. Silently posting a header with an empty
  // leaderboard under it would be worse than telling the admin why not.
  if (!text) back(slug, seasonId, 'empty');

  const result = await postToDiscord(slug, fitToDiscord(text));
  back(slug, seasonId, result.ok ? 'ok' : result.reason);
}

export async function postSeasonRecap(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const leagueName = String(formData.get('leagueName') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const year = Number(formData.get('year'));

  if (!leagueId || !slug || !seasonId || !Number.isFinite(year)) redirect(`/${slug}`);
  if (!(await isLeagueAdmin(leagueId))) redirect(`/${slug}`);

  const text = seasonRecap(await seasonRecapInput(leagueId, leagueName, year));
  if (!text) back(slug, seasonId, 'empty');

  const result = await postToDiscord(slug, fitToDiscord(text));
  back(slug, seasonId, result.ok ? 'ok' : result.reason);
}
