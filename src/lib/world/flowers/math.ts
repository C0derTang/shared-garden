/** Small vector, colour and seeding helpers for the flower generator. */

import type { Vec3 } from "../layout";
import { createRandom } from "../strokes";
import type { Rgb } from "./parts";

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** a + b * k */
export const madd = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export const UP: Vec3 = [0, 1, 0];
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** Any unit vector perpendicular to `n`. */
export function perpendicular(n: Vec3): Vec3 {
  const ref: Vec3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return normalize(cross(ref, n));
}

/** Rotates `v` about unit `axis` by `angle` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = dot(axis, v) * (1 - c);
  const x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * d, v[1] * c + x[1] * s + axis[1] * d, v[2] * c + x[2] * s + axis[2] * d];
}

/** Point on a cubic Bézier. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]];
}

/** Unit tangent of a cubic Bézier. */
export function bezierTangent(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return normalize([
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]) + c * (p3[0] - p2[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]) + c * (p3[1] - p2[1]),
    a * (p1[2] - p0[2]) + b * (p2[2] - p1[2]) + c * (p3[2] - p2[2]),
  ]);
}

/** 32-bit integer finaliser (murmur3 fmix32). */
function mix32(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Folds a flower seed (an integer 0 .. 2^53 - 1) and a stream name into a
 * 32-bit PRNG seed. Both halves of the seed matter, so seeds that differ only
 * in their high bits still give different plants.
 */
export function seedHash(seed: number, stream: string): number {
  const safe = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) % 2 ** 53 : 0;
  const lo = safe % 2 ** 32 >>> 0;
  const hi = Math.floor(safe / 2 ** 32) >>> 0;
  return mix32(mix32(lo ^ 0x9e3779b9) ^ mix32(hi + 0x7f4a7c15) ^ hashString(stream));
}

/** A deterministic random stream for one named aspect of one flower. */
export function streamFor(seed: number, stream: string): () => number {
  return createRandom(seedHash(seed, stream));
}

/** sRGB hex to linear-light RGB. */
export function linear(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(16), channel(8), channel(0)];
}

export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const scaleRgb = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/**
 * Natural variation of a linear colour: value ±`amount`, a small warm/cool
 * hue drift and a saturation nudge, all from `random`.
 */
export function vary(color: Rgb, random: () => number, amount: number): Rgb {
  const value = 1 + (random() * 2 - 1) * amount;
  const warm = (random() * 2 - 1) * amount * 0.6;
  const sat = 1 + (random() * 2 - 1) * amount * 0.8;
  const grey = (color[0] + color[1] + color[2]) / 3;
  const s = (c: number) => Math.max(0, grey + (c - grey) * sat);
  return [s(color[0]) * value * (1 + warm), s(color[1]) * value, s(color[2]) * value * (1 - warm)];
}
