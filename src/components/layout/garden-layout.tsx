import type { ReactNode } from "react";
import { MemberPreferences } from "@/components/settings/member-preferences";
import { SheetScope } from "@/components/ui/sheet-scope";
import { readSettings } from "@/lib/settings/actions";
import { PrivateInteraction } from "@/components/private-interaction/private-interaction";
import {
  GardenNavigation,
  type GardenDestination,
} from "@/components/layout/garden-navigation";

// Each destination retains its own guard; the settings read also reauthorizes.
export async function GardenLayout({
  current,
  children,
  header,
}: {
  current: GardenDestination;
  children: ReactNode;
  header: ReactNode;
}) {
  const preferences = await readSettings();
  return (
    <MemberPreferences initial={preferences}>
    <SheetScope>
    <div className="garden-layout">
      <header className="garden-header">{header}</header>
      <main id="main-content" className="garden-main">
        <PrivateInteraction ownerControls={current === "settings"} />
        {children}
      </main>
      <GardenNavigation current={current} />
    </div>
    </SheetScope>
    </MemberPreferences>
  );
}
