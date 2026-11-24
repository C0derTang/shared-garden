import type { Metadata } from "next";
import { MemberNamesProvider } from "@/components/auth/member-names";
import { GardenV2 } from "@/components/garden-v2/garden-v2";
import { partnerDisplayName } from "@/lib/auth/display-names";
import { requireMember } from "@/lib/auth/server";
import { refreshGardenV2 } from "@/lib/garden-v2/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "our garden · cc’s garden" };

/** A flower id from `?flower=`: a UUID, or nothing. */
function flowerParam(value: string | string[] | undefined) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

/** The new garden (decision 0067): members only; `?flower=<id>` opens that flower. */
export default async function GardenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { member } = await requireMember();
  const [initial, params] = await Promise.all([refreshGardenV2(), searchParams]);
  return (
    <MemberNamesProvider partnerName={partnerDisplayName(member.member_id)}>
      <GardenV2 initial={initial} initialFlowerId={flowerParam(params.flower)} />
    </MemberNamesProvider>
  );
}
