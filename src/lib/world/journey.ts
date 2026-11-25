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

/** A flower the camera glides to before its detail view opens. */
export interface FocusTarget {
  /** Base of the stem in world space. */
  readonly position: Vec3;
  /** Height of the plant above its base. */
  readonly height: number;
}

/** Blends two poses (t = 0 gives `a`, 1 gives `b`), eased. */
export function blendPoses(a: JourneyPose, b: JourneyPose, t: number): JourneyPose {
  const s = smooth(t);
  return { eye: mix(a.eye, b.eye, s), look: mix(a.look, b.look, s) };
}

/**
 * A close, slightly raised look at one flower. The flower is framed where the
 * detail view will show its large render: the left half on landscape screens,
 * the top of a portrait screen. `fovY` is the camera's vertical field of view.
 */
export function focusPose(target: FocusTarget, aspect: number, fovY: number): JourneyPose {
  const h = Math.min(1.6, Math.max(0.25, Number.isFinite(target.height) ? target.height : 0.6));
  const [x, y, z] = target.position;
  const centre: Vec3 = [x, y + h * 0.55, z];
  const distance = 1.5 + h * 1.9;
  const eye: Vec3 = [x + 0.15, centre[1] + 0.45 + h * 0.4, z + distance];
  const reach = Math.hypot(eye[1] - centre[1], eye[2] - centre[2]);
  const tanY = Math.tan(fovY / 2);
  const landscape = aspect >= 1;
  // Shift the look point so the flower lands at NDC x = -0.5 (landscape) or y = +0.45 (portrait).
  const look: Vec3 = landscape
    ? [centre[0] + 0.5 * reach * tanY * aspect, centre[1], centre[2]]
    : [centre[0], centre[1] - 0.45 * reach * tanY, centre[2]];
  return { eye, look };
}
