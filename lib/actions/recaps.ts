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

/**
 * Where to land after posting.
 *
 * Built from the form's own fields rather than taking a URL, so this can
 * never be talked into redirecting somewhere off-site. The score-entry
 * screen is the other place a recap gets posted from -- having just entered
 * the results is exactly when you want to send them -- and being bounced to
 * a different screen for having pressed a button there would be its own
 * small bug.
 */
function back(
  slug: string,
  seasonId: string,
  outcome: string,
  returnTo: { screen: 'admin'; year: string; eventId: string } | null,
): never {
  const posted = `posted=${encodeURIComponent(outcome)}`;
  if (returnTo) {
    redirect(
      `/${slug}/admin?year=${encodeURIComponent(returnTo.year)}&event=${encodeURIComponent(returnTo.eventId)}&${posted}`,
    );
  }
  redirect(`/${slug}/admin/seasons/${seasonId}?${posted}`);
}

/** Only the score-entry screen asks to be returned to; anything else is the
 *  season screen, which is where the rest of the recaps live. */
function returnToOf(
  formData: FormData,
  eventId: string,
): { screen: 'admin'; year: string; eventId: string } | null {
  if (String(formData.get('returnTo') ?? '') !== 'admin') return null;
  const year = String(formData.get('year') ?? '');
  if (!year) return null;
  return { screen: 'admin', year, eventId };
}

export async function postEventRecap(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const leagueName = String(formData.get('leagueName') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const seasonId = String(formData.get('seasonId') ?? '');
  const eventId = String(formData.get('eventId') ?? '');

  if (!leagueId || !slug || !seasonId || !eventId) redirect(`/${slug}`);
  if (!(await isLeagueAdmin(leagueId))) redirect(`/${slug}`);

  const returnTo = returnToOf(formData, eventId);

  const input = await eventRecapInput(leagueId, leagueName, eventId);
  if (!input) back(slug, seasonId, 'missing', returnTo);

  const text = eventRecap(input);
  // No played rounds means no recap. Silently posting a header with an empty
  // leaderboard under it would be worse than telling the admin why not.
  if (!text) back(slug, seasonId, 'empty', returnTo);

  const result = await postToDiscord(slug, fitToDiscord(text));
  back(slug, seasonId, result.ok ? 'ok' : result.reason, returnTo);
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
  if (!text) back(slug, seasonId, 'empty', null);

  const result = await postToDiscord(slug, fitToDiscord(text));
  back(slug, seasonId, result.ok ? 'ok' : result.reason, null);
}
