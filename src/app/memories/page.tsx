import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberHeader } from "@/components/layout/member-header";
import { MemoriesClient } from "@/components/memories/memories-client";
import { requireMember } from "@/lib/auth/server";
import { loadMemories } from "@/lib/memories/actions";
export const dynamic = "force-dynamic";
export default async function MemoriesPage() {
  const { member } = await requireMember();
  const initial = await loadMemories();
  return (
    <GardenLayout current="memories" header={<MemberHeader />}>
      <MemoriesClient initial={initial} memberId={member.member_id} />
    </GardenLayout>
  );
}
