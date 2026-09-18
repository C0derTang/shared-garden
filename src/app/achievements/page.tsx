import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberHeader } from "@/components/layout/member-header";
import { AchievementsClient } from "@/components/achievements/achievements-client";
import { requireMember } from "@/lib/auth/server";
import { readAchievements } from "@/lib/achievements/actions";
export const dynamic = "force-dynamic";
export default async function AchievementsPage() {
  await requireMember();
  const initial = await readAchievements();
  return (
    <GardenLayout current="achievements" header={<MemberHeader />}>
      <AchievementsClient initial={initial} />
    </GardenLayout>
  );
}
