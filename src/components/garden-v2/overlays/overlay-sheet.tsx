"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { handFont } from "@/components/world/hand-font";
import v2 from "../garden-v2.module.css";
import styles from "./overlays.module.css";

const themeStyle = { "--hand": handFont.style.fontFamily } as CSSProperties;

/** Layers that live outside the sheet but belong to it (the private moment's sheets). */
const nestedLayer = ".sheet-content, .sheet-overlay";

export interface OverlaySheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** The handwritten title; also the dialog's accessible name. */
  readonly title: string;
  /** A short line under the title; also the dialog's description. */
  readonly lede?: ReactNode;
  /** `wide` for album-like views, `narrow` for the guide's little card. */
  readonly size?: "wide" | "medium" | "narrow";
  readonly view: string;
  /** Where keyboard focus returns when the sheet closes. */
  readonly onReturnFocus?: () => void;
  /** A slot for notices that must stay reachable while the sheet is modal. */
  readonly noticeRef?: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

/**
 * A soft, painterly translucent sheet over the painted world. A modal dialog
 * (Radix): focus starts at its title and stays inside; Escape, "×" or a tap on
 * the world around it closes it, and focus returns to what opened it.
 */
export function OverlaySheet({ open, onClose, title, lede, size = "medium", view, onReturnFocus, noticeRef, children }: OverlaySheetProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.scrim} data-size={size} />
        <Dialog.Content
          className={`${v2.theme} ${styles.sheet} ${handFont.className}`}
          style={themeStyle}
          data-size={size}
          data-view={view}
          {...(lede ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(event) => {
            // Start at the title so screen readers hear which view opened.
            event.preventDefault();
            titleRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (!onReturnFocus) return;
            event.preventDefault();
            onReturnFocus();
          }}
          onInteractOutside={(event) => {
            // The private moment's sheets sit outside this one; using them must not close it.
            const target = event.target as Element | null;
            if (target?.closest?.(nestedLayer)) event.preventDefault();
          }}
        >
          <header className={styles.head}>
            <div className={styles.headWords}>
              <Dialog.Title ref={titleRef} className={styles.title} tabIndex={-1}>
                {title}
              </Dialog.Title>
              {lede ? <Dialog.Description className={styles.lede}>{lede}</Dialog.Description> : null}
            </div>
            <Dialog.Close className={styles.close} aria-label={`Close ${title}`}>
              <span aria-hidden="true">×</span>
            </Dialog.Close>
          </header>
          <div ref={noticeRef} className={styles.notices} data-private-notice-host="panel" />
          <div className={styles.body}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
