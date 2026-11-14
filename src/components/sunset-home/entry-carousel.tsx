"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { LandingEntry, LandingFlower } from "@/lib/landing/types";
import styles from "./sunset-home.module.css";

export const slideDelay = (length: number) =>
  Math.min(12_000, 6_000 + Math.max(0, length - 140) * 25);
const query = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", change);
  return () => media?.removeEventListener("change", change);
}
const reduced = () => window.matchMedia?.(query).matches ?? true;
function subscribeVisibility(change: () => void) {
  document.addEventListener("visibilitychange", change);
  return () => document.removeEventListener("visibilitychange", change);
}
const pageHidden = () => document.visibilityState === "hidden";

function ControlIcon({ kind }: { kind: "next" | "previous" | "pause" | "play" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.3">
      {kind === "pause" ? <path d="M9 6v12M15 6v12" /> :
        kind === "play" ? <path d="m9 6 9 6-9 6Z" /> :
          <path d={kind === "next" ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />}
    </svg>
  );
}

export function EntryCarousel({ flower, entries, unavailable = false }: {
  flower: LandingFlower;
  entries: LandingEntry[];
  unavailable?: boolean;
}) {
  const noun = flower[0].toUpperCase() + flower.slice(1);
  const reducedMotion = useSyncExternalStore(subscribeMotion, reduced, () => true);
  const hidden = useSyncExternalStore(subscribeVisibility, pageHidden, () => false);
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = entries.length;
  const position = count ? index % count : 0;
  const entry = entries[position];
  const canRotate = count > 1 && !reducedMotion;
  const rotating = canRotate && !stopped && !hovered && !focused && !hidden;
  const length = Array.from(entry?.text ?? "").length;

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => setIndex((value) => (value + 1) % count), slideDelay(length));
    return () => window.clearTimeout(timer);
  }, [rotating, position, count, length]);

  return (
    <section className={styles.card} aria-roledescription="carousel" aria-labelledby={`${flower}-heading`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}>
      <header className={styles.cardHeader}>
        <h2 id={`${flower}-heading`}>{noun}</h2>
        {canRotate ? <button type="button" className={styles.iconButton}
          aria-label={`${stopped ? "Start" : "Stop"} rotating ${noun} entries`}
          onClick={() => setStopped((value) => !value)}>
          <ControlIcon kind={stopped ? "play" : "pause"} />
        </button> : null}
      </header>
      {entry ? <>
        <div className={styles.entryWindow} aria-live={rotating ? "off" : "polite"}>
          <div key={entry.id} role="group" aria-roledescription="slide" aria-label={`${position + 1} of ${count}`} className={styles.slide}>
            <p className={styles.entryText}>{entry.text}</p>
            <p className={styles.meta}>{entry.author ? <>{entry.author}<span aria-hidden="true"> · </span></> : null}<time dateTime={entry.day}>{entry.day}</time></p>
          </div>
        </div>
        {count > 1 ? <div className={styles.controls}>
          <button type="button" className={styles.iconButton} aria-label={`Previous ${noun} entry`} onClick={() => setIndex((position + count - 1) % count)}><ControlIcon kind="previous" /></button>
          <span className={styles.counter} aria-hidden="true">{String(position + 1).padStart(2, "0")}<span>/</span>{String(count).padStart(2, "0")}</span>
          <button type="button" className={styles.iconButton} aria-label={`Next ${noun} entry`} onClick={() => setIndex((position + 1) % count)}><ControlIcon kind="next" /></button>
        </div> : null}
      </> : <p className={styles.empty}>{unavailable ? "These entries couldn’t load. Try again later." : "Nothing planted on these pages yet."}</p>}
    </section>
  );
}
