"use client";
import { useEffect, useRef, useState } from "react";
import { PrivateInteraction } from "@/components/private-interaction/private-interaction";
import { handFont } from "@/components/world/hand-font";
import { gardenViews, guideUnseen, markGuideSeen, type GardenView } from "@/lib/garden-v2/views";
import v2 from "../garden-v2.module.css";
import { AchievementsView } from "./achievements-view";
import { GardenNav } from "./garden-nav";
import { GuideView, guideSteps } from "./guide-view";
import { MemoriesView } from "./memories-view";
import { OverlaySheet } from "./overlay-sheet";
import { SettingsView } from "./settings-view";
import { SongsView } from "./songs-view";
import styles from "./overlays.module.css";

const ledes: Partial<Record<GardenView, string>> = {
  memories: "Little moments from every flower.",
  achievements: "Small milestones we reach together.",
  songs: "Every song we’ve shared with a tulip.",
};
const sizes: Record<GardenView, "wide" | "medium" | "narrow"> = {
  memories: "wide",
  achievements: "wide",
  songs: "medium",
  settings: "medium",
  guide: "narrow",
};

/** Focus goes back to the menu word that opened the overlay, else to the painted world. */
function returnFocus(word: GardenView | null) {
  const link = word ? document.querySelector<HTMLElement>(`[data-nav-view="${word}"]`) : null;
  (link ?? document.querySelector<HTMLElement>("[data-garden-world]"))?.focus();
}

export interface GardenOverlaysProps {
  /** The open overlay, from `?view=` or the menu. */
  readonly view: GardenView | null;
  readonly memberId: 1 | 2;
  /** The first-visit guide waits for the painted world, and never follows a link to a flower. */
  readonly canGreet: boolean;
  /** A flower's view is open: the menu steps out of its painting. */
  readonly flowerOpen: boolean;
  readonly onOpen: (view: GardenView) => void;
  readonly onClose: () => void;
  /** Leave the overlay for a flower in the world. */
  readonly onVisit: (flowerId: string) => void;
}

/**
 * The new garden's menu and its overlays (Memories, Achievements, Songs,
 * Settings and a short guide), plus the private moment. The moment keeps its
 * legacy gate and behavior (decisions 0020 and 0067): recipients get it here
 * too, and its owner controls show in Settings.
 */
export function GardenOverlays({ view, memberId, canGreet, flowerOpen, onOpen, onClose, onVisit }: GardenOverlaysProps) {
  const [notices, setNotices] = useState<HTMLDivElement | null>(null);
  const [owner, setOwner] = useState<HTMLDivElement | null>(null);
  const [coach, setCoach] = useState(false);
  // The guide returns focus to Settings when replayed from there, else to the world.
  const guideFrom = useRef<GardenView | null>(null);

  // First visit in this browser: open the guide once the world is painted.
  const greeted = useRef(false);
  useEffect(() => {
    if (greeted.current || !canGreet) return;
    greeted.current = true;
    // Arriving at another overlay by link, or a moment already open (the
    // private moment), skips the greeting this visit; it is not marked seen.
    if (view !== null || document.querySelector('[role="dialog"]') || !guideUnseen(memberId)) return;
    guideFrom.current = null;
    onOpen("guide");
  }, [canGreet, view, memberId, onOpen]);

  const close = () => {
    if (view === "guide") {
      markGuideSeen(memberId);
      setCoach(false);
    }
    onClose();
  };

  return (
    <>
      {!flowerOpen && <GardenNav onOpen={onOpen} glow={coach} />}
      {/* The moment's sheets portal outside the garden, so they get the hand font here. */}
      <style>{`.${styles.momentSheet}{--hand:${handFont.style.fontFamily}}`}</style>
      <div className={styles.momentHost}>
        <PrivateInteraction
          ownerControls={view === "settings"}
          ownerContainer={view === "settings" ? owner : null}
          noticeContainer={view ? notices : undefined}
          sheetClassName={`${v2.theme} ${styles.momentSheet}`}
          onMomentCloseAutoFocus={(event) => {
            // The moment's trigger may sit behind an open overlay; resume inside the overlay instead.
            const open = document.querySelector<HTMLElement>("[data-garden-overlay]");
            if (open?.isConnected) {
              event.preventDefault();
              open.querySelector<HTMLElement>("button, a[href]")?.focus();
            }
          }}
        />
      </div>
      {view && (
        <OverlaySheet
          key={view}
          open
          view={view}
          title={gardenViews[view]}
          lede={ledes[view]}
          size={sizes[view]}
          onClose={close}
          onReturnFocus={() => returnFocus(view === "guide" ? guideFrom.current : view)}
          noticeRef={setNotices}
        >
          <div data-garden-overlay={view}>
            {view === "memories" && <MemoriesView memberId={memberId} onVisit={onVisit} />}
            {view === "achievements" && <AchievementsView />}
            {view === "songs" && <SongsView memberId={memberId} onVisit={onVisit} />}
            {view === "settings" && <SettingsView
                ownerRef={setOwner}
                onGuide={() => {
                  guideFrom.current = "settings";
                  onOpen("guide");
                }}
              />}
            {view === "guide" && <GuideView onDone={close} onStep={(index) => setCoach(index === guideSteps.length - 1)} />}
          </div>
        </OverlaySheet>
      )}
    </>
  );
}
