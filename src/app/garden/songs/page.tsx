import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberHeader } from "@/components/layout/member-header";
import { SongCollection } from "@/components/music/song-collection";
import { requireMember } from "@/lib/auth/server";
import { loadSongs } from "@/lib/music/collection-actions";

export const dynamic = "force-dynamic";
export default async function SongsPage() {
  const { member } = await requireMember();
  const initial = await loadSongs();
  return (
    <GardenLayout current="garden" header={<MemberHeader />}>
      <SongCollection memberId={member.member_id} initial={initial} />
    </GardenLayout>
  );
}
