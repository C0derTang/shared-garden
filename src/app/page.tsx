import { PublicLanding } from "@/components/landing/public-landing";
import { getAuthConfig } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <PublicLanding
      configurationStatus={getAuthConfig() ? "ready" : "missing"}
    />
  );
}
