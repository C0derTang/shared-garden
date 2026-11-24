"use client";
import { Fragment, type MouseEvent } from "react";
import { gardenViewHref, navViews, type GardenView } from "@/lib/garden-v2/views";
import styles from "./overlays.module.css";

/**
 * The garden's own little menu: handwritten words floating in the sky,
 * "memories · achievements · songs · settings". Each is a real link to its
 * `?view=` overlay, so it works before scripts run; scripts open the overlay
 * in place.
 */
export function GardenNav({ onOpen, glow = false }: { onOpen: (view: GardenView) => void; glow?: boolean }) {
  const open = (view: GardenView) => (event: MouseEvent<HTMLAnchorElement>) => {
    // Let modified clicks open the link normally.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(view);
  };
  return (
    <nav className={styles.nav} aria-label="Garden keepsakes" data-glow={glow || undefined}>
      {navViews.map((view, index) => (
        <Fragment key={view}>
          {index > 0 && (
            <span className={styles.navDot} aria-hidden="true">
              ·
            </span>
          )}
          <a
            href={gardenViewHref(view)}
            className={styles.navWord}
            data-nav-view={view}
            onClick={open(view)}
          >
            {view}
          </a>
        </Fragment>
      ))}
    </nav>
  );
}
