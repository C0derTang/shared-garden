"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import { useMemberPreferences } from "@/components/settings/member-preferences";
import { civilTwilight, solarDay, sunPosition, sunTimes } from "@/lib/garden/solar";
import styles from "./garden-ambience.module.css";

/** Time of day in the garden (decision 0050), from the real Pacific sun. */
export type GardenPhase = "dawn" | "day" | "golden" | "dusk" | "night";
/** The phase, and how far (0–1) the sun or moon has crossed the sky. */
export type GardenLight = { phase: GardenPhase; progress: number };

const hour = 3_600_000;
const day = 86_400_000;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * The garden light for a garden-clock instant, from the sun over Los Angeles.
 * Night is when the sun is more than 6° below the horizon. Dawn runs from civil
 * dawn to an hour after sunrise, golden hour is the last hour before sunset,
 * and dusk runs from sunset to civil dusk. The Moonflower flag plays no part.
 *
 * The sun crosses the sky with its real azimuth, from where it rises (0) to
 * where it sets (1); through twilight it waits low at that edge. The moon
 * crosses the sky from civil dusk to the next civil dawn.
 */
export function gardenPhase(now: number): GardenLight {
  const base = solarDay(now);
  const today = sunTimes(base);
  const { elevation, azimuth } = sunPosition(now);
  if (elevation < civilTwilight) {
    const [dusk, dawn] = now > today.noon
      ? [today.civilDusk, sunTimes(base + day).civilDawn]
      : [sunTimes(base - day).civilDusk, today.civilDawn];
    return { phase: "night", progress: clamp((now - dusk) / (dawn - dusk)) };
  }
  const rise = sunPosition(today.sunrise).azimuth;
  const set = sunPosition(today.sunset).azimuth;
  const progress = clamp((azimuth - rise) / (set - rise));
  const phase: GardenPhase =
    now < today.noon
      ? now < today.sunrise + hour ? "dawn" : "day"
      : now >= today.sunset ? "dusk" : now >= today.sunset - hour ? "golden" : "day";
  return { phase, progress };
}

/** The sky's disc, which the clock icon also shows: the moon at night, the sun otherwise. */
export const celestialBody = (phase: GardenPhase) => (phase === "night" ? "moon" : "sun");

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
 * after hydration, so the markup never mismatches. The light is worked out once
 * per clock minute, so a page left open changes light at the right moments and
 * per-second ticks change nothing.
 */
export function useGardenLight(now: number): GardenLight | null {
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const clockMinute = hydrated && now > 0 ? Math.floor(now / 60_000) : null;
  return useMemo(() => (clockMinute === null ? null : gardenPhase(clockMinute * 60_000)), [clockMinute]);
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
  const celestial = track && track.segments.length > 0 ? alongTrack(track, light.progress) : null;
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
              data-celestial={celestialBody(phase)}
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
