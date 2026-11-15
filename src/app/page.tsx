import { SunsetLanding } from "@/components/sunset-home/sunset-landing";
import { loadLandingAccess } from "@/lib/landing/access";

export const dynamic = "force-dynamic";

export default async function Home() {
  return <SunsetLanding data={await loadLandingAccess()} />;
}
