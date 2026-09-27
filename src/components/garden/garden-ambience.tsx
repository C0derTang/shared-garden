"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { useMemberPreferences } from "@/components/settings/member-preferences";
import styles from "./garden-ambience.module.css";

/** Time of day in the garden (decision 0050). Night is the Moonflower window. */
export type GardenPhase = "dawn" | "day" | "golden" | "dusk" | "night";
export type GardenLight = { phase: GardenPhase; minute: number };

const pacificClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

/** Minutes since Pacific midnight for a garden-clock instant. */
export function pacificMinute(now: number) {
  const parts = pacificClock.formatToParts(new Date(now));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (part("hour") % 24) * 60 + part("minute");
}

/**
 * The server's `moonflower_open` flag alone decides night, so the light always
 * agrees with the clock icon and the Moonflower. Around its edges, before the
 * next garden read confirms the change, the hour picks the nearest non-night
 * phase instead.
 */
export function gardenPhase(now: number, moonflowerOpen: boolean): GardenLight {
  const minute = pacificMinute(now);
  if (moonflowerOpen) return { phase: "night", minute };
  const hour = minute / 60;
  const phase: GardenPhase =
    hour < 8 ? "dawn" : hour < 17 ? "day" : hour < 20 ? "golden" : "dusk";
  return { phase, minute };
}

const subscribeNothing = () => () => {};
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(change: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener?.("change", change);
  return () => query.removeEventListener?.("change", change);
}
const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" && window.matchMedia(reducedMotionQuery).matches;

/**
 * The garden light for the current clock, or null during server rendering and
 * hydration. Both render the same neutral garden, and the phase appears right
 * after hydration, so the markup never mismatches.
 */
export function useGardenLight(now: number, moonflowerOpen: boolean | undefined): GardenLight | null {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const light = hydrated && now > 0 ? gardenPhase(now, !!moonflowerOpen) : null;
  const phase = light?.phase;
  const minute = light?.minute;
  // Keep one object per phase and minute, so per-second ticks change nothing.
  return useMemo(
    () => (phase && minute !== undefined ? { phase, minute } : null),
    [phase, minute],
  );
}

// The sun crosses the sky from 4 a.m. to 10 p.m., matching the clock's sun
// icon, and the moon crosses it through Moonflower hours.
export function celestialProgress({ phase, minute }: GardenLight) {
  const progress =
    phase === "night"
      ? (minute >= 1320 ? minute - 1320 : minute + 120) / 360
      : (minute - 240) / 1080;
  return Math.min(1, Math.max(0, progress));
}

type Box = { left: number; top: number; right: number; bottom: number };
/** Where the sun or moon's centre may travel: one height and free spans. */
export type SkyTrack = { y: number; segments: [number, number][] };
// The visible disc core, the clearance kept around it, and the shortest
// track worth using before trying the lower band.
const core = 20;
const clearance = 8;
const minimumTrack = 96;
const controlLip = 3;

/**
 * Finds a track for the sun or moon in open sky (decision 0050). The first
 * choice is the row of the Help and Songs signs, between the controls. If the
 * controls leave too little room there (a narrow phone with the Guide button),
 * the track drops to a band just below the row and above the flowers. The disc
 * core keeps `clearance` from every control and flower, and never goes under
 * the header.
 */
export function skyTrack(width: number, headerBottom: number, row: { top: number; bottom: number }, obstacles: Box[]): SkyTrack | null {
  const bands = [(row.top + row.bottom) / 2, row.bottom + controlLip + clearance + core / 2];
  let best: SkyTrack | null = null;
  let bestLength = 0;
  for (const y of bands) {
    if (y - core / 2 < headerBottom) continue;
    let free: [number, number][] = [[clearance + core / 2, width - clearance - core / 2]];
    for (const o of obstacles) {
      if (o.bottom + clearance <= y - core / 2 || o.top - clearance >= y + core / 2) continue;
      const from = o.left - clearance - core / 2;
      const to = o.right + clearance + core / 2;
      free = free.flatMap(([l, r]) => ([[l, Math.min(r, from)], [Math.max(l, to), r]] as [number, number][]).filter(([a, b]) => b > a));
    }
    const length = free.reduce((sum, [l, r]) => sum + r - l, 0);
    if (length >= minimumTrack) return { y, segments: free };
    if (length > bestLength) {
      best = { y, segments: free };
      bestLength = length;
    }
  }
  return best;
}

/** The point `t` (0–1) of the way along a track's free spans. */
export function alongTrack({ y, segments }: SkyTrack, t: number) {
  const total = segments.reduce((sum, [l, r]) => sum + r - l, 0);
  let left = t * total;
  for (const [l, r] of segments) {
    if (left <= r - l) return { x: l + left, y };
    left -= r - l;
  }
  const last = segments[segments.length - 1];
  return { x: last[1], y };
}

// Measures the garden's controls, cards and first flowers, relative to the
// garden, again whenever one appears, changes or resizes.
function useSkyTrack(ref: RefObject<HTMLDivElement | null>) {
  const [track, setTrack] = useState<SkyTrack | null>(null);
  useEffect(() => {
    const layer = ref.current;
    const garden = layer?.parentElement;
    if (!layer || !garden || typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined") return;
    let last = "";
    const measure = () => {
      const origin = garden.getBoundingClientRect();
      const box = (r: DOMRect): Box => ({ left: r.left - origin.left, right: r.right - origin.left, top: r.top - origin.top, bottom: r.bottom - origin.top });
      let header: Element | null = null;
      const blocking: Box[] = [];
      for (const child of garden.children) {
        // The beds are measured as flowers below; the layer itself never blocks.
        if (child === layer || child.querySelector("section section")) continue;
        if (child.tagName === "HEADER") {
          header = child;
          continue;
        }
        mutations.observe(child, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "class"] });
        const rect = child.getBoundingClientRect();
        // A full-width row stands for its children; only its contents block.
        for (const element of rect.width >= origin.width * 0.9 ? [...child.children] : [child]) {
          sizes.observe(element);
          const r = element.getBoundingClientRect();
          // Visually hidden live regions (1px boxes) never block the sky.
          if (r.width > 4 && r.height > 4) blocking.push(box(r));
        }
      }
      const flowers = [...garden.querySelectorAll("section section svg")]
        .map((svg) => svg.getBoundingClientRect())
        .filter((r) => r.width > 0)
        .map(box);
      const headerBottom = header ? header.getBoundingClientRect().bottom - origin.top + 4 : 0;
      // The sign row: the controls that start right under the header.
      const signs = blocking.filter((b) => b.top < headerBottom + 20);
      const row = signs.length
        ? { top: Math.min(...signs.map((b) => b.top)), bottom: Math.min(...signs.map((b) => b.bottom)) }
        : { top: headerBottom, bottom: headerBottom + 44 };
      const next = skyTrack(origin.width, headerBottom, row, [...blocking, ...flowers]);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setTrack(next);
      }
    };
    const sizes = new ResizeObserver(measure);
    const mutations = new MutationObserver(measure);
    sizes.observe(garden);
    mutations.observe(garden, { childList: true });
    // Cards drop in with a short transform animation; measure where they land.
    garden.addEventListener("animationend", measure);
    return () => {
      sizes.disconnect();
      mutations.disconnect();
      garden.removeEventListener("animationend", measure);
    };
  }, [ref]);
  return track;
}

// Fixed, hand-placed positions keep the layer deterministic and cheap.
const stars = [[6, 18], [14, 52], [23, 30], [31, 70], [39, 12], [47, 44], [55, 78], [61, 24], [70, 58], [77, 16], [85, 40], [93, 66], [18, 86], [66, 88]];
const fireflies = [[12, 22], [28, 64], [44, 38], [62, 74], [80, 30], [90, 58], [20, 46], [54, 18], [72, 50], [36, 84]];
const petals = [[8, 0], [26, -6], [47, -11], [63, -3], [81, -8], [92, -14]];

/**
 * Time-of-day light, sky and ambience beneath the plots and flowers. It is
 * decorative only: hidden from assistive technology, never focusable and
 * transparent to pointer input.
 */
export function GardenAmbience({ light }: { light: GardenLight | null }) {
  const preferences = useMemberPreferences();
  const layer = useRef<HTMLDivElement>(null);
  const track = useSkyTrack(layer);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  // Motion follows the member's gentle-motion setting and the device setting.
  const gentleMotion = preferences ? preferences.state?.gentle_motion === true : true;
  const still = reducedMotion || !gentleMotion;
  if (!light) return <div ref={layer} className={styles.ambience} aria-hidden="true" />;
  const { phase } = light;
  const glowCount = phase === "night" ? fireflies.length : phase === "dusk" ? 4 : 0;
  const celestial = track && track.segments.length > 0 ? alongTrack(track, celestialProgress(light)) : null;
  const showPetals = !still && (phase === "dawn" || phase === "day" || phase === "golden");
  return (
    <div
      ref={layer}
      className={styles.ambience}
      data-phase={phase}
      data-motion={still ? "still" : "live"}
      aria-hidden="true"
    >
      <div key={phase} className={styles.light}>
        <div className={styles.tint} />
        <div className={styles.vignette} />
        <div className={styles.sky}>
          {phase === "night" &&
            stars.map(([left, top], index) => (
              <i key={index} className={styles.star} style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${-index * 0.7}s` }} />
            ))}
          {celestial && (
            <i
              className={styles.celestial}
              data-celestial={phase === "night" ? "moon" : "sun"}
              style={{ left: celestial.x, top: celestial.y }}
            />
          )}
        </div>
      </div>
      {(glowCount > 0 || showPetals) && (
        <div className={styles.motes}>
          {fireflies.slice(0, glowCount).map(([left, top], index) => (
            <i
              key={`glow-${index}`}
              className={styles.firefly}
              data-firefly=""
              style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${-index * 1.3}s, ${-index * 0.9}s`, animationDuration: `${9 + (index % 4) * 2}s, ${2.6 + (index % 3) * 0.8}s` }}
            />
          ))}
          {showPetals &&
            petals.map(([left, drift], index) => (
              <i
                key={`petal-${index}`}
                className={styles.petal}
                data-petal=""
                style={{ left: `${left}%`, "--petal-drift": `${drift}vw`, animationDelay: `${-index * 3.1}s`, animationDuration: `${16 + (index % 3) * 3}s` } as CSSProperties}
              />
            ))}
        </div>
      )}
    </div>
  );
}
