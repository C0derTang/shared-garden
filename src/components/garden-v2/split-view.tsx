"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { useSheetScope } from "@/components/ui/sheet-scope";
import { FlowerHero } from "@/components/world/flowers/flower-hero";
import { handFont } from "@/components/world/hand-font";
import type { PlantSpec } from "@/lib/garden-v2/flowers";
import styles from "./garden-v2.module.css";

export interface SplitViewProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The flower painted large on the left (top on phones). */
  readonly spec: PlantSpec;
  /** Accessible description of the painting, e.g. "A rose in bloom". */
  readonly heroLabel: string;
  /** Handwritten words over the painting: the flower's name and stage. */
  readonly heroName: string;
  readonly heroStage?: string;
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  /** Where keyboard focus returns when the view closes. */
  readonly onReturnFocus?: () => void;
  readonly children: ReactNode;
  readonly closeLabel?: string;
  /** Blows a Dandelion's seeds away in the painting (#201): each new token plays once. */
  readonly blowSeeds?: number | null;
}

/** Seedlings stay small in the painting and grow into the frame as they grow. */
const HERO_MIN_EXTENT = 0.32;

/** Hand font as a variable, so reused components' type can follow it. */
const themeStyle = { "--hand": handFont.style.fontFamily } as CSSProperties;

/**
 * While open, the view takes its turn in the shared sheet scope, as the legacy
 * flower sheets do (decision 0019, `BottomSheet`): a private moment that
 * becomes pending waits behind an open view, keeping its draft and focus, and
 * a view asked for while the moment is showing waits until the moment closes.
 * Its notices show in the view's notice slot. Without a scope it simply opens.
 */
function useSheetSlot(open: boolean) {
  const id = useId();
  const scope = useSheetScope();
  const request = scope?.request;
  const release = scope?.release;
  const register = scope?.registerNoticeContainer;
  useEffect(() => {
    if (open) request?.(id);
    return () => release?.(id);
  }, [id, open, request, release]);
  const noticeRef = useCallback((element: HTMLDivElement | null) => register?.(id, element), [id, register]);
  return { visible: open && (!scope || scope.active === id), noticeRef };
}

/**
 * The split view: one flower painted large on the left half, its activity and
 * details on the right half; stacked on phones (painting on top). A modal
 * dialog: focus stays inside, Escape or "back to the garden" closes it, and
 * focus returns to the flower's words in the world.
 */
export function SplitView({
  open,
  onClose,
  spec,
  heroLabel,
  heroName,
  heroStage,
  title,
  subtitle,
  onReturnFocus,
  children,
  closeLabel = "Back to the garden",
  blowSeeds = null,
}: SplitViewProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { visible, noticeRef } = useSheetSlot(open);
  return (
    <Dialog.Root open={visible} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          className={`${styles.theme} ${styles.split} ${handFont.className}`}
          style={themeStyle}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Start at the heading so screen readers hear which flower opened.
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (!onReturnFocus) return;
            event.preventDefault();
            onReturnFocus();
          }}
        >
          <div className={styles.hero}>
            <FlowerHero spec={spec} label={heroLabel} className={styles.heroCanvas} minExtent={HERO_MIN_EXTENT} backdrop="sky" blowSeeds={blowSeeds} />
            <p className={styles.heroWords} aria-hidden="true">
              <span className={styles.heroName}>{heroName}</span>
              {heroStage && <span className={styles.heroStage}>{heroStage}</span>}
            </p>
          </div>
          <div className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <Dialog.Title ref={titleRef} className={styles.title} tabIndex={-1}>
                  {title}
                </Dialog.Title>
                {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
              </div>
              <Dialog.Close className={styles.close} aria-label={closeLabel}>
                <span aria-hidden="true">×</span>
              </Dialog.Close>
            </header>
            <div ref={noticeRef} className={styles.slotNotices} data-private-notice-host="sheet" />
            {children}
            <Dialog.Close className={styles.back}>
              <span aria-hidden="true">← </span>back to the garden
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
