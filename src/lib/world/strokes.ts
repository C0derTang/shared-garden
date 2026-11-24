/**
 * The brushstroke primitive shared by the painted world and anything painted
 * into it (such as the procedural flowers). A stroke is one dab of paint: a
 * tapered, bristled ribbon laid from `origin` along `axis` in world space.
 * The GPU side lives in `src/components/world/strokes/`.
 */

import type { Vec3 } from "./layout";

/** How a stroke orients, moves and takes light. */
export const STROKE_KIND = {
  /** Lies flat on a surface (ground cover, soil). Width spreads along the surface. */
  surface: 0,
  /** Stands up and turns its face to the camera (grass blades, stems); sways in the wind. */
  blade: 1,
  /** Foliage dab on a volume such as a tree canopy; lit by its normal. */
  foliage: 2,
  /** Bark and stems: upright, camera-facing, no sway. */
  trunk: 3,
  /** Sky paint on the far dome; coloured by the sky, not lit. `albedo` alpha is cloudiness. */
  sky: 4,
  /** A star dab, only visible at night. */
  star: 5,
  /** Petals and blossoms: camera-facing, sway, keep their colour bright. */
  petal: 6,
} as const;

export type StrokeKind = (typeof STROKE_KIND)[keyof typeof STROKE_KIND];

export interface Stroke {
  readonly kind: StrokeKind;
  /** Where the brush touches down (world space). */
  readonly origin: Vec3;
  /** Direction and length of the stroke (world space). */
  readonly axis: Vec3;
  /** Width of the loaded brush (world units). */
  readonly width: number;
  /** Sideways curl of the stroke, as a fraction of its length (-1..1). */
  readonly bend: number;
  /** Per-stroke random seed in [0, 1). */
  readonly seed: number;
  /** Surface normal used for lighting and for laying `surface`/`foliage` strokes. */
  readonly normal: Vec3;
  /** Linear-light paint colour. */
  readonly color: Vec3;
  /**
   * Extra channel: cloudiness for `sky` strokes; dryness (0 wet, 1 dry-brush
   * broken bristles) for every other kind.
   */
  readonly extra: number;
}

/** Floats per packed stroke instance. */
export const STROKE_FLOATS = 17;

/** WebGPU instance attributes matching {@link packStrokes} (and `stroke.wgsl`). */
export const STROKE_ATTRIBUTES = {
  origin: "float32x3",
  axis: "float32x3",
  shape: "float32x4",
  normal: "float32x3",
  paint: "float32x4",
} as const;

/** Packs strokes into the interleaved instance layout read by `stroke.wgsl`. */
export function packStrokes(strokes: readonly Stroke[]): Float32Array<ArrayBuffer> {
  const data = new Float32Array(strokes.length * STROKE_FLOATS);
  strokes.forEach((s, i) => {
    const o = i * STROKE_FLOATS;
    data[o] = s.origin[0];
    data[o + 1] = s.origin[1];
    data[o + 2] = s.origin[2];
    data[o + 3] = s.axis[0];
    data[o + 4] = s.axis[1];
    data[o + 5] = s.axis[2];
    data[o + 6] = s.width;
    data[o + 7] = s.bend;
    data[o + 8] = s.seed;
    data[o + 9] = s.kind;
    data[o + 10] = s.normal[0];
    data[o + 11] = s.normal[1];
    data[o + 12] = s.normal[2];
    data[o + 13] = s.color[0];
    data[o + 14] = s.color[1];
    data[o + 15] = s.color[2];
    data[o + 16] = s.extra;
  });
  return data;
}

/** Small seeded PRNG (mulberry32), so painted content is deterministic. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Value-jitters a linear colour by up to ±`amount` (multiplicative), with a slight hue drift. */
export function jitterColor(color: Vec3, random: () => number, amount: number): Vec3 {
  const value = 1 + (random() * 2 - 1) * amount;
  const warm = (random() * 2 - 1) * amount * 0.5;
  return [
    Math.max(0, color[0] * value * (1 + warm)),
    Math.max(0, color[1] * value),
    Math.max(0, color[2] * value * (1 - warm)),
  ];
}
