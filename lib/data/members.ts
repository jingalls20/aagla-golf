import { createClient } from '@/lib/supabase/server';
import type { MemberRole } from '@/lib/data/admin';

export interface LeagueMemberRow {
  id: string;
  userId: string;
  email: string;
  role: MemberRole;
}

/**
 * A league's admin roster, with email attached.
 *
 * `league_members` has no email column of its own -- it only carries
 * `user_id`, and `auth.users` isn't reachable from a plain PostgREST query --
 * so this goes through the `list_league_members` RPC (0010_league_member_management.sql),
 * which joins to `auth.users` with elevated privileges and checks the caller
 * is an admin of this league itself before returning anything.
 */
export async function getLeagueMembers(leagueId: string): Promise<LeagueMemberRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_league_members', {
    p_league_id: leagueId,
  });
  if (error) throw new Error(`Loading league members: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      id: string;
      user_id: string;
      email: string;
      role: MemberRole;
    }[]
  ).map((r) => ({ id: r.id, userId: r.user_id, email: r.email, role: r.role }));
}
