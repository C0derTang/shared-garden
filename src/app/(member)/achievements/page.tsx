import { AchievementsClient } from "@/components/achievements/achievements-client";
import { requireMember } from "@/lib/auth/server";
import { readAchievements } from "@/lib/achievements/actions";
export const dynamic = "force-dynamic";
export default async function AchievementsPage() {
  await requireMember();
  const initial = await readAchievements();
  return (
    <>
      <AchievementsClient initial={initial} />
    </>
  );
}
