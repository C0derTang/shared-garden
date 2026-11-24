"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArchiveProvider } from "@/components/garden/archive";
import { GardenClient } from "@/components/garden/garden-client";
import { PrivateInteraction } from "@/components/private-interaction/private-interaction";
import { useSheetScope } from "@/components/ui/sheet-scope";
import type { GardenResult } from "@/lib/garden/model";
import { legacyPanel, legacyPanelFromHref, legacyPanelHref, legacyPanels, legacyPath, type LegacyPanel } from "@/lib/legacy/routes";
import { GardenNavigation, type GardenDestination } from "./garden-navigation";

/** Persistent authorized legacy garden, a read-only archive, with the `?panel=` contents layered over it. */
export function GardenStage({ initial, children }: { initial: GardenResult; children: ReactNode }) {
  const panel = legacyPanel(useSearchParams().get("panel"));
  const router = useRouter();
  const title = panel ? legacyPanels[panel] : undefined;
  const scope = useSheetScope();
  const [admittedPanel, setAdmittedPanel] = useState<LegacyPanel | null>(null);
  // A history navigation must not mount a new trap over an existing flower draft.
  // Once admitted, the parent stays mounted while its child sheets take focus.
  if (panel && admittedPanel !== panel && !scope?.active) setAdmittedPanel(panel);
  if (!panel && admittedPanel !== null) setAdmittedPanel(null);
  const panelOpen = !!panel && admittedPanel === panel;
  const [ownerContainer, setOwnerContainer] = useState<HTMLDivElement | null>(null);
  const [noticeContainer, setNoticeContainer] = useState<HTMLDivElement | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const panelElement = useRef<HTMLDivElement>(null);
  const openedFromGarden = useRef(false);
  const previousPanel = useRef<string | null>(null);
  const current: GardenDestination = panel === "memories" || panel === "achievements" || panel === "settings" ? panel : "garden";
  useEffect(() => {
    if (panel) previousPanel.current = legacyPanelHref(panel);
    else if (previousPanel.current && !scope?.active) {
      const href = previousPanel.current;
      previousPanel.current = null;
      openedFromGarden.current = false;
      backdrop.current?.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)?.focus({ preventScroll: true });
    }
  }, [panel, scope?.active]);
  function close() {
    if (openedFromGarden.current) router.back();
    else router.replace(legacyPath, { scroll: false });
  }
  return <ArchiveProvider value={true}><div className="garden-layout">
    <div ref={backdrop} inert={!!title || !!scope?.active} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest("a");
      if (!panel && link && legacyPanelFromHref(link.getAttribute("href") ?? "")) openedFromGarden.current = true;
    }}>
      <main id="main-content" className="garden-main"><GardenClient initial={initial} guideEnabled={!title} /></main>
      <GardenNavigation current={current} />
    </div>
    <Dialog.Root open={panelOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="route-panel-overlay" />
        <Dialog.Content ref={panelElement} className="route-panel" aria-describedby={undefined} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <header className="route-panel-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="pixel-button" aria-label="Close panel">Close</Dialog.Close>
          </header>
          <div ref={setNoticeContainer} className="route-panel-notices" data-private-notice-host="panel" />
          <div className="route-panel-body" key={panel}>
            {children}
            {panel === "settings" && <div ref={setOwnerContainer} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <PrivateInteraction ownerControls={panel === "settings"} ownerContainer={ownerContainer} noticeContainer={title ? noticeContainer : undefined} onMomentCloseAutoFocus={(event) => {
      // The pending trigger lives outside this parent modal. Resume focus inside
      // the route panel instead of restoring its inaccessible background trigger.
      if (panelElement.current?.isConnected) { event.preventDefault(); panelElement.current.querySelector<HTMLButtonElement>("button")?.focus(); }
    }} />
  </div></ArchiveProvider>;
}
