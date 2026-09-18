import { UpcomingPage } from "@/components/layout/upcoming-page";
export const dynamic = "force-dynamic";
export default function SettingsPage() {
  return (
    <UpcomingPage
      current="settings"
      title="Garden settings"
      description="The reopenable garden introduction is coming soon. Your garden follows Pacific time, with each new day beginning at 4 a.m."
    />
  );
}
