"use client";
import { handFont } from "../hand-font";
import styles from "./fireworks.module.css";

export interface FireworksOverlayProps {
  /** The caption naming the achievements, shown while the show plays. */
  readonly caption: string;
  readonly playing: boolean;
  /** Shows the "replay fireworks" control. */
  readonly canReplay: boolean;
  readonly onReplay: () => void;
  /** Hides everything (e.g. while a full-screen view covers the world). */
  readonly hidden?: boolean;
}

/**
 * The fireworks' handwritten words over the scene: a gentle caption while the
 * show plays and a small "replay fireworks" control under the corner links
 * (quieted and inert while a show plays). Neither
 * catches pointer events outside the control itself, so the world stays
 * pickable around them.
 */
export function FireworksOverlay({ caption, playing, canReplay, onReplay, hidden = false }: FireworksOverlayProps) {
  if (hidden) return null;
  return (
    <>
      <p className={`${styles.caption} ${handFont.className}`} role="status" aria-live="polite">
        {playing && caption ? (
          <span className={styles.captionText}>
            <span className={styles.star} aria-hidden="true">
              ✦{" "}
            </span>
            {caption}
          </span>
        ) : null}
      </p>
      {canReplay && (
        // Stays mounted while the show plays (only quieted), so keyboard focus is never lost.
        <button
          type="button"
          className={`${styles.replay} ${handFont.className}`}
          aria-disabled={playing || undefined}
          onClick={() => {
            if (!playing) onReplay();
          }}
        >
          <span className={styles.star} aria-hidden="true">
            ✦{" "}
          </span>
          replay fireworks
        </button>
      )}
    </>
  );
}
