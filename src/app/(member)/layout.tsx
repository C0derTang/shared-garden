import type { ReactNode } from "react";
import { GardenLayout } from "@/components/layout/garden-layout";
import { MemberNamesProvider } from "@/components/auth/member-names";
import { partnerDisplayName } from "@/lib/auth/display-names";
import { requireMember } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function MemberLayout({ children }: { children: ReactNode }) {
  const { member } = await requireMember();
  const partnerName = partnerDisplayName(member.member_id);
  return <MemberNamesProvider partnerName={partnerName}><GardenLayout>{children}</GardenLayout></MemberNamesProvider>;
}
