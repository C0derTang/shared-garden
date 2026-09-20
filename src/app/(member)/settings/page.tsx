import { SettingsClient } from "@/components/settings/settings-client";
import { requireMember } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function SettingsPage() {
  await requireMember();
  return <><SettingsClient /></>;
}
