import { LakesideLanding } from "@/components/lakeside-landing/lakeside-landing";
import { loadLandingAccess } from "@/lib/landing/access";

export const dynamic = "force-dynamic";

/**
 * The lakeside house landing (decision 0067). The server verifies membership;
 * visitors get only the scene and Log in. The sunset home (decision 0066)
 * stays in the repository, unrouted.
 */
export default async function Home() {
  const access = await loadLandingAccess();
  return <LakesideLanding member={access.status === "member"} />;
}
