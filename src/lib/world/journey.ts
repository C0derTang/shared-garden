import { CAMERA_HOME, type Vec3 } from "./layout";

export interface JourneyPose {
  readonly eye: Vec3;
  readonly look: Vec3;
}

function smooth(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function mix(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Key poses of the scroll journey: the overview from the meadow's edge, a walk
// in among the beds, and a lower, closer look across them toward the lake.
const KEYS: readonly JourneyPose[] = [
  { eye: CAMERA_HOME, look: [0, 0.7, -20] },
  { eye: [0.3, 2.1, 13.4], look: [0.1, 0.4, -6] },
  { eye: [0.5, 1.75, 12.2], look: [0.3, 0.1, 3.5] },
];

/** Camera pose for a journey position from 0 (overview) to 1 (among the beds). */
export function journeyPose(progress: number): JourneyPose {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)) * (KEYS.length - 1);
  const i = Math.min(KEYS.length - 2, Math.floor(p));
  const t = smooth(p - i);
  return { eye: mix(KEYS[i]!.eye, KEYS[i + 1]!.eye, t), look: mix(KEYS[i]!.look, KEYS[i + 1]!.look, t) };
}
