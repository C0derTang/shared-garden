"use client";

import type { GardenPlot } from "@/lib/garden-v2/plots";
import styles from "./plot-list.module.css";

export interface PlotListProps {
  /** Flowers and planting targets in type-area order. */
  readonly plots: readonly GardenPlot[];
  /** Open a plot: a flower's split view, or the planting view for an empty spot. */
  onOpen(plot: GardenPlot): void;
  /** A full-screen view or sheet covers the garden: the list is inert and hidden from assistive technology. */
  readonly hidden?: boolean;
}

/**
 * The garden's hidden keyboard plot list (#210). The painted world has no
 * visible names or controls over its plots, so keyboard and screen-reader
 * users reach every plot here instead: a visually hidden list of buttons, one
 * per flower or type-area planting target. Only the focused
 * button shows, as a small chip naming its plot, like a skip link. Activating
 * one opens the flower's split view, or the planting view for an empty spot.
 */
export function PlotList({ plots, onOpen, hidden = false }: PlotListProps) {
  return (
    <nav className={styles.plots} aria-label="Plots in the garden" data-plot-list="" inert={hidden || undefined} aria-hidden={hidden || undefined}>
      <ul className={styles.list}>
        {plots.map((plot) => (
          <li key={plot.spot}>
            <button type="button" className={styles.plot} data-plot-spot={plot.spot} aria-label={plot.ariaLabel} onClick={() => onOpen(plot)}>
              {plot.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Frames to keep trying while the list is still inert under the closing view. */
const FOCUS_RETRY_FRAMES = 20;

/**
 * Returns keyboard focus after a view closes: to the hidden plot button for
 * `spot` (when the view was opened from the list), else to the world. The
 * list may stay inert for a moment while the closing view's render settles,
 * so a refused focus is retried on the next frames, unless focus has
 * meanwhile gone somewhere else on purpose.
 */
export function focusPlot(spot: number | null) {
  const settled = () => document.activeElement !== null && document.activeElement !== document.body;
  const attempt = (left: number) => {
    const button = spot === null ? null : document.querySelector<HTMLElement>(`[data-plot-list] [data-plot-spot="${spot}"]`);
    const current=document.activeElement;
    // A delayed close callback must not steal a newer keyboard/pointer destination.
    if(current instanceof HTMLElement && current!==document.body && current!==button && !current.closest('[role="dialog"]'))return;
    button?.focus();
    if (button && document.activeElement === button) return;
    if (button && left > 0 && !settled()) {
      requestAnimationFrame(() => attempt(left - 1));
      return;
    }
    if (!settled()) document.querySelector<HTMLElement>("[data-garden-world]")?.focus();
  };
  attempt(FOCUS_RETRY_FRAMES);
}
