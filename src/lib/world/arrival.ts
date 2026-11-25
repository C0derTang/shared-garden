import type { JourneyPose } from "./journey";
import type { Vec3 } from "./layout";

/**
 * The garden's arrival after the walk through the house door (#204): the
 * page opens covered by the same warm light the walk-through dissolved into,
 * holds it until the painted world is ready, then lets the light thin away
 * while the camera drifts back and down from a raised, sky-lit look into the
 * overview. Title and menu fade in last; the first-visit guide waits for the
 * whole arrival to settle.
 */

/** Length of the arrival camera move, in seconds. */
export const ARRIVAL_SECONDS = 3.6;
/** The warm light starts to thin this long after the arrival begins. */
export const ARRIVAL_LIGHT_DELAY = 0.15;
/** How long the warm light takes to fade away (eased). */
export const ARRIVAL_LIGHT_SECONDS = 2.1;
/** Title, words and menu start to fade in at this point of the arrival. */
export const ARRIVAL_CHROME_SECONDS = 2.4;
/** The arrival has settled (the guide may greet) at this point. */
export const ARRIVAL_SETTLE_SECONDS = 4;
/** Reduced motion: a plain crossfade out of the light, with no camera move. */
export const ARRIVAL_CROSSFADE_SECONDS = 0.6;
/** Reduced motion: settled shortly after the crossfade. */
export const ARRIVAL_STILL_SETTLE_SECONDS = 0.8;
/**
 * Frames the world paints, with every layer (such as the flowers) ready,
 * before the light starts to thin, so no half-built frame is ever revealed.
 */
export const ARRIVAL_WARM_FRAMES = 3;
/** The arrival starts anyway after waiting this long (seconds of frames) for layers. */
export const ARRIVAL_LAYER_WAIT_SECONDS = 4;

/** Raised and a little closer than the overview, looking up toward the bright sky. */
const START_EYE_OFFSET: Vec3 = [0, 1.5, -2.4];
const START_LOOK_RAISE = 5.5;

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
}

/** Smootherstep: starts and ends at rest with no jerk. */
export function smootherstep(t: number): number {
  const c = clamp01(t);
  return c * c * c * (c * (c * 6 - 15) + 10);
}

function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Where the arrival starts, relative to the pose it settles into. */
export function arrivalStartPose(settled: JourneyPose): JourneyPose {
  const [ex, ey, ez] = settled.eye;
  const [lx, ly, lz] = settled.look;
  return {
    eye: [ex + START_EYE_OFFSET[0], ey + START_EYE_OFFSET[1], ez + START_EYE_OFFSET[2]],
    look: [lx, ly + START_LOOK_RAISE, lz],
  };
}

/**
 * Camera pose `seconds` into the arrival, gliding (eased at both ends) from
 * the raised start into `settled`, the pose the garden would otherwise show.
 * Reduced motion goes straight to `settled`.
 */
export function arrivalPose(seconds: number, settled: JourneyPose, still = false): JourneyPose {
  if (still) return settled;
  const t = smootherstep(seconds / ARRIVAL_SECONDS);
  if (t >= 1) return settled;
  const start = arrivalStartPose(settled);
  return { eye: mix(start.eye, settled.eye, t), look: mix(start.look, settled.look, t) };
}

/** Opacity of the warm light `seconds` into the arrival (1 while holding). */
export function arrivalLightOpacity(seconds: number, still = false): number {
  if (still) return 1 - clamp01(seconds / ARRIVAL_CROSSFADE_SECONDS);
  return 1 - smoothstep((seconds - ARRIVAL_LIGHT_DELAY) / ARRIVAL_LIGHT_SECONDS);
}

export type ArrivalStage = "light" | "chrome" | "settled";

/** What the page shows `seconds` into the arrival (negative while the light holds). */
export function arrivalStage(seconds: number, still = false): ArrivalStage {
  if (!(seconds >= 0)) return "light";
  const settle = still ? ARRIVAL_STILL_SETTLE_SECONDS : ARRIVAL_SETTLE_SECONDS;
  if (seconds >= settle) return "settled";
  if (seconds >= (still ? 0 : ARRIVAL_CHROME_SECONDS)) return "chrome";
  return "light";
}
