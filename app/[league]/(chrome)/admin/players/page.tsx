import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeague, getPlayers } from '@/lib/data/queries';
import { isLeagueAdmin } from '@/lib/data/admin';
import {
  addPlayer,
  setPlayerStatus,
  updatePlayer,
  uploadPlayerPhoto,
} from '@/lib/actions/admin';
import { Badge, Card, Empty, TableWrap, Th, Td } from '@/components/ui';
import { Avatar } from '@/components/avatar';
import { TableHint } from '@/components/table-hint';

export default async function PlayersAdminPage({
  params,
}: {
  params: Promise<{ league: string }>;
}) {
  const { league: slug } = await params;
  const league = await getLeague(slug);
  if (!league) notFound();

  const admin = await isLeagueAdmin(league.id);
  if (!admin) {
    return (
      <Empty>
        You don&rsquo;t have admin access to {league.name}. If that&rsquo;s wrong, ask
        the league owner to add you in admin settings.
      </Empty>
    );
  }

  const players = await getPlayers(league.id);
  const sorted = [...players].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <Link
        href={`/${slug}/admin`}
        className="text-xs text-slate-400 hover:text-slate-600"
      >
        ← Back to score entry
      </Link>

      <Card title="Players">
        <TableHint>
          Active players are who show up for score entry, standings, and handicaps --
          this list isn&rsquo;t scoped to one season, so review it before each new one
          starts. Marking someone inactive doesn&rsquo;t touch their history, it just
          leaves them off current screens. Edit a name only to fix a typo or spelling --
          it&rsquo;s how the league tells one player from another across every season on
          record. Set a face either way: paste a link in the <strong>Photo</strong>{' '}
          field, or choose an image file and press <strong>Upload photo</strong> — an
          upload replaces whatever the link said. JPEG, PNG, WebP or GIF, up to 5MB.
        </TableHint>
        <TableWrap>
          <thead>
            <tr>
              <Th>Player</Th>
              <Th>Status</Th>
              <Th>Name</Th>
              <Th>First year</Th>
              <Th>Photo</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <Avatar name={p.name} photoUrl={p.photo_url} />
                    {p.name}
                  </span>
                </Td>
                <Td>
                  {p.status === 'active' ? (
                    <Badge tone="green">active</Badge>
                  ) : (
                    <Badge>inactive</Badge>
                  )}
                </Td>
                <Td colSpan={3}>
                  <form
                    action={updatePlayer}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="leagueId" value={league.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="playerId" value={p.id} />
                    <input
                      type="text"
                      name="name"
                      required
                      defaultValue={p.name}
                      className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                    <input
                      type="number"
                      name="firstYear"
                      defaultValue={p.first_year ?? ''}
                      placeholder="year"
                      className="w-20 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                    <input
                      type="text"
                      name="photoUrl"
                      defaultValue={p.photo_url ?? ''}
                      placeholder="https://…"
                      className="w-40 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-800 dark:bg-slate-900"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      Save
                    </button>
                  </form>
                  <form
                    action={uploadPlayerPhoto}
                    className="mt-1.5 flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="leagueId" value={league.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="playerId" value={p.id} />
                    <input
                      type="file"
                      name="photo"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="w-56 text-xs text-slate-500 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-slate-200 dark:file:bg-slate-800 dark:hover:file:bg-slate-700"
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:border-fairway-500 hover:text-fairway-600 dark:border-slate-800"
                    >
                      Upload photo
                    </button>
                  </form>
                </Td>
                <Td align="right">
                  <form action={setPlayerStatus}>
                    <input type="hidden" name="leagueId" value={league.id} />
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="playerId" value={p.id} />
                    <input
                      type="hidden"
                      name="status"
                      value={p.status === 'active' ? 'inactive' : 'active'}
                    />
                    <button
                      type="submit"
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
                    >
                      {p.status === 'active' ? 'Mark inactive' : 'Mark active'}
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card title="Add a player">
        <form action={addPlayer} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="leagueId" value={league.id} />
          <input type="hidden" name="slug" value={slug} />
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              Name
            </span>
            <input
              name="name"
              required
              className="w-48 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <label className="flex flex-col text-xs">
            <span className="mb-1 font-medium uppercase tracking-wide text-slate-400">
              First year (optional)
            </span>
            <input
              type="number"
              name="firstYear"
              className="w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-fairway-600 px-4 py-2 text-sm font-medium text-white hover:bg-fairway-900"
          >
            Add player
          </button>
        </form>
      </Card>
    </div>
  );
}
