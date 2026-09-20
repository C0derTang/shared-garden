import { MemoriesClient } from "@/components/memories/memories-client";
import { requireMember } from "@/lib/auth/server";
import { loadMemories } from "@/lib/memories/actions";
export const dynamic = "force-dynamic";
export default async function MemoriesPage() {
  const { member } = await requireMember();
  const initial = await loadMemories();
  return (
    <>
      <MemoriesClient initial={initial} memberId={member.member_id} />
    </>
  );
}
