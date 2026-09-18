import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberHeader } from "@/components/layout/member-header";
import { GardenClient } from "@/components/garden/garden-client";
import { requireMember } from "@/lib/auth/server";
import { refreshGarden } from "@/lib/garden/actions";

export const dynamic = "force-dynamic";
export default async function GardenPage() {
  await requireMember();
  // The action independently verifies live membership before loading any state.
  const initial = await refreshGarden();
  return (
    <GardenLayout current="garden" header={<MemberHeader />}>
      <GardenClient initial={initial} />
    </GardenLayout>
  );
}
