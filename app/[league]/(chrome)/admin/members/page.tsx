import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague } from '@/lib/data/queries';
import { isLeagueOwner } from '@/lib/data/admin';
import { getLeagueMembers } from '@/lib/data/members';
import { inviteMember, removeMember, updateMemberRole } from '@/lib/actions/members';
import { Badge, Card, Empty, TableWrap, Th, Td } from '@/components/ui';
import { ConfirmSubmitButton } from '@/components/confirm-button';

export default async function MembersAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ league: string }>;
  searchParams: Promise<{ invited?: string; error?: string }>;
}) {
  const { league: slug } = await params;
  const { invited, error } = await searchParams;
  const league = await getLeague(slug);
  if (!league) notFound();

  const owner = await isLeagueOwner(league.id);
  if (!owner) {
    return (
      <Empty>
        Only {league.name}&rsquo;s owner can manage admin access. If you need
        access changed, ask them.
      </Empty>
    );
  }

  const members = await getLeagueMembers(league.id);

  return (
    <div className="space-y-6">
      <Link href={`/${slug}/admin`} className="text-xs text-slate-400 hover:text-slate-600">
        ← Back to score entry
      </Link>

      {invited ? (
        <p className="rounded-lg border border-fairway-500 bg-fairway-50 p-3 text-sm text-fairway-600 dark:border-fairway-600 dark:bg-fairway-900 dark:text-fairway-50">
          {invited} now has access.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
          {error}
        </p>
      ) : null}

      <Card title="Admin access">
        <p className="mb-3 text-xs text-slate-400">
          Everyone listed here can enter scores and manage {league.name}. Owner is you
          and can&rsquo;t be changed from this screen; co-admins have every other
          admin ability.
        </p>
        <TableWrap>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <Td>{m.email}</Td>
                <Td>
                  {m.role === 'owner' ? (
                    <Badge tone="green">owner</Badge>
                  ) : (
                    <form action={updateMemberRole} className="flex items-center gap-2">
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <input type="hidden" name="targetUserId" value={m.userId} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </select>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                      >
                        Update
                      </button>
                    </form>
                  )}
                </Td>
                <Td align="right">
                  {m.role === 'owner' ? null : (
                    <form action={removeMember}>
                      <input type="hidden" name="leagueId" value={league.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <input type="hidden" name="targetUserId" value={m.userId} />
                      <ConfirmSubmitButton
                        confirmText={`Remove ${m.email}'s access to ${league.name}?`}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-slate-800 dark:hover:bg-red-900/20"
                      >
                        Remove
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="Invite a co-admin">
        <p className="mb-3 text-xs text-slate-400">
          They need to have signed in to AAGLA Golf at least once already -- ask
          them to sign in with Google, then invite their email here.
        </p>
        <form action={inviteMember} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">Email</span>
            <input
              type="email"
              name="email"
              required
              placeholder="name@example.com"
              className="w-64 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">Role</span>
            <select
              name="role"
              defaultValue="admin"
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
          >
            Invite
          </button>
        </form>
      </Card>
    </div>
  );
}
