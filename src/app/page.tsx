import { PublicLanding } from "@/components/landing/public-landing";
import { getPublicConfig } from "@/lib/config/public";

export default function Home() {
  return <PublicLanding configurationStatus={getPublicConfig().status} />;
}
