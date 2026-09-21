"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GardenClient } from "@/components/garden/garden-client";
import { PrivateInteraction } from "@/components/private-interaction/private-interaction";
import { useSheetScope } from "@/components/ui/sheet-scope";
import type { GardenResult } from "@/lib/garden/model";
import { GardenNavigation, type GardenDestination } from "./garden-navigation";

const panels: Record<string, string> = { "/memories": "Memories", "/achievements": "Achievements", "/settings": "Settings", "/garden/songs": "Our songs" };
/** Persistent authorized garden, with destination contents layered over it. */
export function GardenStage({ initial, children }: { initial: GardenResult; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const title = panels[pathname];
  const scope = useSheetScope();
  const [admittedPath, setAdmittedPath] = useState<string | null>(null);
  // A history navigation must not mount a new trap over an existing flower draft.
  // Once admitted, the parent stays mounted while its child sheets take focus.
  if (title && admittedPath !== pathname && !scope?.active) setAdmittedPath(pathname);
  if (!title && admittedPath !== null) setAdmittedPath(null);
  const panelOpen = !!title && admittedPath === pathname;
  const [ownerContainer, setOwnerContainer] = useState<HTMLDivElement | null>(null);
  const [noticeContainer, setNoticeContainer] = useState<HTMLDivElement | null>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const openedFromGarden = useRef(false);
  const previousPanel = useRef<string | null>(null);
  const current = (pathname.slice(1) in { memories: 1, achievements: 1, settings: 1 } ? pathname.slice(1) : "garden") as GardenDestination;
  useEffect(() => {
    if (title) previousPanel.current = pathname;
    else if (previousPanel.current && !scope?.active) {
      const href = previousPanel.current;
      previousPanel.current = null;
      openedFromGarden.current = false;
      backdrop.current?.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)?.focus({ preventScroll: true });
    }
  }, [pathname, title, scope?.active]);
  function close() {
    if (openedFromGarden.current) router.back();
    else router.replace("/garden", { scroll: false });
  }
  return <div className="garden-layout">
    <div ref={backdrop} inert={!!title || !!scope?.active} onClickCapture={(event) => {
      const link = (event.target as HTMLElement).closest("a");
      if (pathname === "/garden" && link && panels[link.getAttribute("href") ?? ""]) openedFromGarden.current = true;
    }}>
      <main id="main-content" className="garden-main"><GardenClient initial={initial} guideEnabled={!title} /></main>
      <GardenNavigation current={current} />
    </div>
    <Dialog.Root open={panelOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="route-panel-overlay" />
        <Dialog.Content ref={panel} className="route-panel" aria-describedby={undefined} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <header className="route-panel-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="button button-secondary" aria-label="Close panel">Close</Dialog.Close>
          </header>
          <div ref={setNoticeContainer} className="route-panel-notices" data-private-notice-host="panel" />
          <div className="route-panel-body" key={pathname}>
            {children}
            {pathname === "/settings" && <div ref={setOwnerContainer} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <PrivateInteraction ownerControls={pathname === "/settings"} ownerContainer={ownerContainer} noticeContainer={title ? noticeContainer : undefined} onMomentCloseAutoFocus={(event) => {
      // The pending trigger lives outside this parent modal. Resume focus inside
      // the route panel instead of restoring its inaccessible background trigger.
      if (panel.current?.isConnected) { event.preventDefault(); panel.current.querySelector<HTMLButtonElement>("button")?.focus(); }
    }} />
  </div>;
}
