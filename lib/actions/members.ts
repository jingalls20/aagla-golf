'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isLeagueOwner } from '@/lib/data/admin';

/**
 * Who else can administer this league. Deliberately owner-only -- unlike
 * every other admin screen, which any admin can use, handing out admin
 * access is the one lever that can hand out every other lever, so it stays
 * with whoever holds `role = 'owner'`.
 *
 * Inviting someone works by email, but `league_members.user_id` is a real
 * foreign key into `auth.users` -- there's no row to point it at until that
 * person has signed in at least once. The `invite_league_member` RPC
 * (0010_league_member_management.sql) does the email lookup and the insert
 * together, and reports back plainly if it can't find an account yet.
 */

async function requireOwner(leagueId: string, slug: string): Promise<void> {
  if (!(await isLeagueOwner(leagueId))) {
    redirect(`/${slug}/admin`);
  }
}

export async function inviteMember(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const email = String(formData.get('email') ?? '').trim();
  const roleRaw = String(formData.get('role') ?? 'admin');
  const role = roleRaw === 'member' ? 'member' : 'admin';
  if (!leagueId || !slug || !email) {
    throw new Error('Missing leagueId, slug, or email on the invite form.');
  }
  await requireOwner(leagueId, slug);

  const supabase = await createClient();
  const { error } = await supabase.rpc('invite_league_member', {
    p_league_id: leagueId,
    p_email: email,
    p_role: role,
  });

  if (error) {
    redirect(`/${slug}/admin/members?error=${encodeURIComponent(error.message)}`);
  }
  redirect(`/${slug}/admin/members?invited=${encodeURIComponent(email)}`);
}

export async function updateMemberRole(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  const roleRaw = String(formData.get('role') ?? '');
  const role = roleRaw === 'member' ? 'member' : 'admin';
  if (!leagueId || !slug || !memberId) {
    throw new Error('Missing leagueId, slug, or memberId on the role form.');
  }
  await requireOwner(leagueId, slug);

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user && user.id === targetUserId) {
    // Changing your own role from this screen risks locking yourself out with
    // no one left to undo it -- the owner stays the owner here.
    redirect(`/${slug}/admin/members?error=${encodeURIComponent("You can't change your own role.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('league_members').update({ role }).eq('id', memberId);
  if (error) throw new Error(`Updating role: ${error.message}`);

  redirect(`/${slug}/admin/members`);
}

export async function removeMember(formData: FormData): Promise<void> {
  const leagueId = String(formData.get('leagueId') ?? '');
  const slug = String(formData.get('slug') ?? '');
  const memberId = String(formData.get('memberId') ?? '');
  const targetUserId = String(formData.get('targetUserId') ?? '');
  if (!leagueId || !slug || !memberId) {
    throw new Error('Missing leagueId, slug, or memberId on the remove-member form.');
  }
  await requireOwner(leagueId, slug);

  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (user && user.id === targetUserId) {
    redirect(`/${slug}/admin/members?error=${encodeURIComponent("You can't remove your own access.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from('league_members').delete().eq('id', memberId);
  if (error) throw new Error(`Removing member: ${error.message}`);

  redirect(`/${slug}/admin/members`);
}
