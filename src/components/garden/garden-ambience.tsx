"use client";
import { useMemo, useSyncExternalStore, type CSSProperties } from "react";
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

// The sun crosses the sky from 4 a.m. to 10 p.m.; the moon from 10 p.m. to 4 a.m.
function celestialPosition({ phase, minute }: GardenLight) {
  const progress =
    phase === "night"
      ? ((minute >= 1320 ? minute - 1320 : minute + 120) / 360)
      : (minute - 240) / 1080;
  const t = Math.min(1, Math.max(0, progress));
  return {
    "--celestial-x": `${Math.round(6 + t * 88)}%`,
    "--celestial-rise": `${Math.round(Math.sin(Math.PI * t) * 12)}px`,
  } as CSSProperties;
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
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => true);
  // Motion follows the member's gentle-motion setting and the device setting.
  const gentleMotion = preferences ? preferences.state?.gentle_motion === true : true;
  const still = reducedMotion || !gentleMotion;
  if (!light) return <div className={styles.ambience} aria-hidden="true" />;
  const { phase } = light;
  const glowCount = phase === "night" ? fireflies.length : phase === "dusk" ? 4 : 0;
  const showPetals = !still && (phase === "dawn" || phase === "day" || phase === "golden");
  return (
    <div
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
          <i className={styles.celestial} style={celestialPosition(light)} />
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
