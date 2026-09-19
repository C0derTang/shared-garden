import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberHeader } from "@/components/layout/member-header";
import { SettingsClient } from "@/components/settings/settings-client";
import { requireMember } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  await requireMember();
  return <GardenLayout current="settings" header={<MemberHeader />}><SettingsClient /></GardenLayout>;
}
