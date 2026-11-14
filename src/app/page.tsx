import { SunsetLanding } from "@/components/sunset-home/sunset-landing";
import { loadLandingData } from "@/lib/landing/entries";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <SunsetLanding data={await loadLandingData()} />;
}
