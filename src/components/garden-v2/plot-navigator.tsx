"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GardenPlot } from "@/lib/garden-v2/plots";
import { stepBed, stepPlot } from "@/lib/world/plots";
import styles from "./plot-navigator.module.css";

/** A swipe must travel this far (CSS px) to step. */
const SWIPE_PX = 28;

export interface PlotNavigatorProps {
  /** Every plot of the open beds, in navigator order. */
  readonly plots: readonly GardenPlot[];
  /** The selected one-based spot, or null while the whole garden is in view. */
  readonly selected: number | null;
  /** Select a plot (the camera frames it), or null to return to the whole garden. */
  onSelect(spot: number | null): void;
  /** Visit a plot: a flower's split view, or the planting view for an empty spot. */
  onVisit(plot: GardenPlot): void;
  /** A full-screen view covers the garden: the navigator fades and is inert and hidden from assistive technology. */
  readonly hidden?: boolean;
}

/**
 * The plot navigator (#206): a small handwritten control low in the scene.
 * Up and down step through the garden's plots bed by bed and row by row (left
 * and right jump between beds), the camera framing each one, and its words
 * name the plot ("rose · 3 of 5", "empty spot"). Enter, a tap on the name or
 * "visit"/"plant" opens it; Escape returns to the whole garden. It is a
 * listbox (with `aria-activedescendant`) whose options are every plot, and it
 * also answers the on-screen arrows and swipes on phones.
 */
export function PlotNavigator({ plots, selected, onSelect, onVisit, hidden = false }: PlotNavigatorProps) {
  const id = useId();
  const swipe = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const swiped = useRef(0);
  const [announcement, setAnnouncement] = useState("");
  const index = selected === null ? -1 : plots.findIndex((plot) => plot.spot === selected);
  const active = index >= 0 ? plots[index]! : null;
  const optionId = (spot: number) => `${id}-plot-${spot}`;

  // The selection can outlive its plot only if the beds change under it; let it go then.
  useEffect(() => {
    if (selected !== null && index < 0) onSelect(null);
  }, [selected, index, onSelect]);

  const choose = (next: number, announce: boolean) => {
    const plot = plots[next];
    if (!plot || next === index) return;
    onSelect(plot.spot);
    // Inside the listbox the active option is announced already; elsewhere say it.
    if (announce) setAnnouncement(`${plot.ariaLabel}. ${next + 1} of ${plots.length}`);
  };
  const step = (by: number, announce = true) => choose(stepPlot(plots.length, index, by), announce);
  const bed = (direction: 1 | -1, announce = true) => choose(stepBed(plots.map((plot) => plot.spot), index, direction), announce);
  const visit = () => {
    if (active) onVisit(active);
    else step(1);
  };

  const onListKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => step(1, false),
      ArrowUp: () => step(-1, false),
      ArrowRight: () => bed(1, false),
      ArrowLeft: () => bed(-1, false),
      PageDown: () => bed(1, false),
      PageUp: () => bed(-1, false),
      Home: () => choose(0, false),
      End: () => choose(plots.length - 1, false),
      Enter: visit,
      " ": visit,
    };
    const action = keys[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || selected === null) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(null);
    setAnnouncement("The whole garden");
  };

  // Swipes on phones: up for the next plot, down for the previous one, sideways between beds.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse") return;
    swipe.current = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start || start.pointer !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    swiped.current = event.timeStamp;
    if (Math.abs(dy) >= Math.abs(dx)) step(dy < 0 ? 1 : -1);
    else bed(dx < 0 ? 1 : -1);
  };
  /** A tap that ended a swipe is not also a press. */
  const tapped = (event: { timeStamp: number }) => event.timeStamp - swiped.current > 400 || swiped.current === 0;

  return (
    <div
      className={styles.navigator}
      data-plot-navigator=""
      data-active={active ? "" : undefined}
      data-due={active?.due ? "" : undefined}
      data-hidden={hidden ? "" : undefined}
      inert={hidden || undefined}
      aria-hidden={hidden || undefined}
      onKeyDown={onKey}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
    >
      <button
        type="button"
        className={styles.step}
        aria-label="Previous plot"
        aria-controls={`${id}-list`}
        aria-disabled={index === 0 || undefined}
        onClick={(event) => tapped(event) && step(-1)}
      >
        <Chevron up />
      </button>
      <div className={styles.row}>
        <ul
          id={`${id}-list`}
          className={styles.list}
          role="listbox"
          tabIndex={0}
          aria-label="Plots in the garden"
          aria-describedby={`${id}-help`}
          aria-activedescendant={active ? optionId(active.spot) : undefined}
          onKeyDown={onListKey}
        >
          {!active && (
            <li role="presentation" aria-hidden="true" className={styles.prompt} onClick={(event) => tapped(event) && step(1)}>
              step through the plots
            </li>
          )}
          {plots.map((plot) => {
            const current = plot.spot === active?.spot;
            return (
              <li
                key={plot.spot}
                id={optionId(plot.spot)}
                role="option"
                aria-selected={current}
                aria-label={plot.ariaLabel}
                className={current ? styles.current : styles.hiddenOption}
                data-empty={plot.plant ? undefined : ""}
                onClick={(event) => current && tapped(event) && onVisit(plot)}
              >
                <span className={styles.label}>{plot.label}</span>
                <span className={styles.detail}>{plot.detail}</span>
              </li>
            );
          })}
        </ul>
        {active && (
          <button type="button" className={styles.visit} onClick={(event) => tapped(event) && onVisit(active)}>
            {active.plant ? "visit" : "plant"}
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.step}
        aria-label="Next plot"
        aria-controls={`${id}-list`}
        aria-disabled={index === plots.length - 1 || undefined}
        onClick={(event) => tapped(event) && step(1)}
      >
        <Chevron />
      </button>
      <p id={`${id}-help`} className={styles.srOnly}>
        Up and down step through the plots, left and right move between beds. Enter visits a plot; Escape returns to the whole garden.
      </p>
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

/** A loose, hand-drawn chevron (decorative; the button has its own name). */
function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg className={styles.chevron} viewBox="0 0 40 20" aria-hidden="true" focusable="false">
      <path d={up ? "M5 15.5 C11 11 15 7.5 20.5 4.5 C25 8 29.5 11.5 35 15" : "M5 4.5 C11 9 15 12.5 20 15.5 C25 12 29.5 8.5 35 5"} />
    </svg>
  );
}

/** Moves keyboard focus to the navigator's list (after a view closes), else to the world. */
export function focusPlotNavigator() {
  const list = document.querySelector<HTMLElement>("[data-plot-navigator] [role=listbox]");
  list?.focus();
  if (!list || document.activeElement !== list) document.querySelector<HTMLElement>("[data-garden-world]")?.focus();
}
