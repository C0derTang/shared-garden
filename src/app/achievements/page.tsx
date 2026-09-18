import { UpcomingPage } from "@/components/layout/upcoming-page";
export const dynamic = "force-dynamic";
export default function AchievementsPage() {
  return (
    <UpcomingPage
      current="achievements"
      title="Little milestones"
      description="Your achievement collection is coming soon. Keep tending your flowers together; their growth and permanent blooms stay in the garden."
    />
  );
}
