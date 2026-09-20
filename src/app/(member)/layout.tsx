import type { ReactNode } from "react";
import { GardenLayout } from "@/components/layout/garden-layout";
import { requireMember } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function MemberLayout({ children }: { children: ReactNode }) {
  await requireMember();
  return <GardenLayout>{children}</GardenLayout>;
}
