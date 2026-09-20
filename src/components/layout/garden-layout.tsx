import type { ReactNode } from "react";
import { MemberPreferences } from "@/components/settings/member-preferences";
import { SheetScope } from "@/components/ui/sheet-scope";
import { readSettings } from "@/lib/settings/actions";
import { refreshGarden } from "@/lib/garden/actions";
import { GardenStage } from "./garden-stage";

// The route-group layout authorizes before mounting; both reads reauthorize.
export async function GardenLayout({ children }: { children: ReactNode }) {
  const [preferences, garden] = await Promise.all([readSettings(), refreshGarden()]);
  return <MemberPreferences initial={preferences}><SheetScope>
    <GardenStage initial={garden}>{children}</GardenStage>
  </SheetScope></MemberPreferences>;
}
