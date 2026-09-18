import { UpcomingPage } from "@/components/layout/upcoming-page";
export const dynamic = "force-dynamic";
export default function MemoriesPage() {
  return (
    <UpcomingPage
      current="memories"
      title="Our memories"
      description="Your shared memory collection is coming soon. For now, open any flower in the garden to read its entries and history."
    />
  );
}
