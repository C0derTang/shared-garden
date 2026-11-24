import { AchievementsClient } from "@/components/achievements/achievements-client";
import { MemoriesClient } from "@/components/memories/memories-client";
import { SongCollection } from "@/components/music/song-collection";
import { SettingsClient } from "@/components/settings/settings-client";
import { readAchievements } from "@/lib/achievements/actions";
import { requireMember } from "@/lib/auth/server";
import { legacyPanel } from "@/lib/legacy/routes";
import { loadMemories } from "@/lib/memories/actions";
import { loadSongs } from "@/lib/music/collection-actions";

export const dynamic = "force-dynamic";

/**
 * The legacy garden itself is the persistent layout. This page supplies the
 * contents of the panel named by `?panel=`, after its own membership check.
 */
export default async function LegacyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { member } = await requireMember();
  switch (legacyPanel((await searchParams).panel)) {
    case "memories":
      return <MemoriesClient initial={await loadMemories()} memberId={member.member_id} />;
    case "achievements":
      return <AchievementsClient initial={await readAchievements()} />;
    case "settings":
      return <SettingsClient />;
    case "songs":
      return <SongCollection memberId={member.member_id} initial={await loadSongs()} />;
    default:
      return null;
  }
}
