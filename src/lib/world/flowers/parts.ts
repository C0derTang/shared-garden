/**
 * The building blocks of a procedural flower. A flower is a list of parts in
 * flower-local space (+y up, base of the stem at the origin, +z toward the
 * default viewer). Each part is one GPU instance of a parametric template that
 * the vertex shader bends into shape (see `src/components/world/flowers/`):
 *
 * - a **sheet** (petal, leaf, sepal, tepal): a curved, cupped, twisted,
 *   ruffled blade;
 * - a **tube** (stem, pedicel, filament, style, spine, seed beak): a tapered
 *   sweep along a cubic Bézier curve;
 * - a **blob** (anther, disk floret, bud, seed, cactus body, pappus): a ribbed,
 *   squared or bumpy ellipsoid.
 */

import type { Vec3 } from "../layout";

export type Rgb = readonly [number, number, number];

/** Paint/shading model of a part (`c0.w` in the packed instance). */
export const MATERIAL = {
  petal: 0,
  leaf: 1,
  stem: 2,
  filament: 3,
  anther: 4,
  disk: 5,
  cactus: 6,
  spine: 7,
  pappus: 8,
} as const;

export type Material = (typeof MATERIAL)[keyof typeof MATERIAL];

interface PartPaint {
  readonly material: Material;
  /** Linear colour at the base (sheets, tubes) or body (blobs). */
  readonly base: Rgb;
  /** Linear colour toward the tip (sheets, tubes) or highlights (blobs). */
  readonly tip: Rgb;
  /** Linear colour of veins, streaks, ridges or areoles. */
  readonly accent: Rgb;
  /** 0..1 strength of veins/streaks. */
  readonly veins: number;
  /** 0..1 light let through when backlit. */
  readonly translucency: number;
  /** Self-luminance (moonflowers glow at night). */
  readonly glow: number;
  /** Per-part random in [0, 1). */
  readonly seed: number;
}

export interface SheetPart extends PartPaint {
  readonly origin: Vec3;
  /** Unit direction the blade grows in at its base. */
  readonly dir: Vec3;
  /** Unit normal of the blade's front (upper/inner) face; perpendicular to `dir`. */
  readonly normal: Vec3;
  readonly length: number;
  /** Full width at the widest point. */
  readonly width: number;
  /** Edges rise toward the front (positive) or fall back (negative), in half-widths. */
  readonly cup: number;
  /** Total bend toward the front along the length, radians (negative reflexes). */
  readonly curl: number;
  /** Extra bend concentrated at the tip, radians. */
  readonly tipCurl: number;
  /** Twist of the blade around its axis from base to tip, radians. */
  readonly twist: number;
  /** Amplitude of the wavy, ruffled edge, in half-widths. */
  readonly ruffle: number;
  /** Ruffle waves along the length. */
  readonly ruffleFreq: number;
  /** Where along the length the blade is widest (0..1). */
  readonly widthPos: number;
  /** Outline exponent: < 1 blunt and rounded, > 1 slender and pointed. */
  readonly tipShape: number;
  /** Depth of a notch cut into the tip (0..0.4). */
  readonly notch: number;
  /** Teeth along each edge (0 = entire margin). */
  readonly teeth: number;
  /** Depth of the teeth as a fraction of the half-width (0..0.9). */
  readonly toothDepth: number;
  /** Minimum width near the base as a fraction of the widest (claw vs sheath). */
  readonly baseWidth: number;
  /**
   * Where the base colour turns into the tip colour along the length (0..1).
   * Low values give a sharp basal blotch or eye; 0.5 a gentle full gradient.
   */
  readonly blend: number;
}

export interface TubePart extends PartPaint {
  /** Cubic Bézier control points. */
  readonly p0: Vec3;
  readonly p1: Vec3;
  readonly p2: Vec3;
  readonly p3: Vec3;
  readonly r0: number;
  readonly r1: number;
}

export interface BlobPart extends PartPaint {
  readonly center: Vec3;
  /** Unit axis of the blob's poles. */
  readonly up: Vec3;
  /** Unit axis perpendicular to `up` (the blob's front). */
  readonly front: Vec3;
  /** Radii across (x), along `up` (y) and along `front` (z). */
  readonly radii: Vec3;
  /** Number of vertical ribs (cactus) or 0. */
  readonly ribs: number;
  /** 0..0.5 depth of the grooves between ribs. */
  readonly ribDepth: number;
  /** Superellipsoid exponent: 1 = ellipsoid, < 1 squarer (columns), > 1 pinched. */
  readonly squareness: number;
  /** 0..1 surface bumps (pollen, florets). */
  readonly bumps: number;
}

/** Floats per packed instance (eleven vec4 attributes). */
export const PART_FLOATS = 44;

/**
 * Instance attributes shared by every template, tightly packed in this order
 * (`flower.wgsl` reads them by name):
 *
 * - `i0..i4`: template geometry (see the pack functions below);
 * - `i5`: flower index, sway phase, part seed, glow;
 * - `i6`: sheet teeth, tooth depth, base width, colour blend point (unused by tubes and blobs);
 * - `c0`: base rgb + material; `c1`: tip rgb + translucency; `c2`: accent rgb + veins;
 * - `anchor`: the flower's base position and height (wind sway).
 */
export const PART_ATTRIBUTES = {
  i0: "float32x4",
  i1: "float32x4",
  i2: "float32x4",
  i3: "float32x4",
  i4: "float32x4",
  i5: "float32x4",
  i6: "float32x4",
  c0: "float32x4",
  c1: "float32x4",
  c2: "float32x4",
  anchor: "float32x4",
} as const;

/** Where and how large a flower model stands (world space). */
export interface Placement {
  readonly position: Vec3;
  /** Rotation about +y, radians. */
  readonly yaw: number;
  readonly scale: number;
}

export const IDENTITY_PLACEMENT: Placement = { position: [0, 0, 0], yaw: 0, scale: 1 };

/** Per-flower values every part of that flower carries. */
export interface FlowerInstanceInfo {
  /** Flower index within its layer (hover glow). */
  readonly index: number;
  /** Wind sway phase in [0, 1). */
  readonly phase: number;
  /** Stem base (world space). */
  readonly base: Vec3;
  /** Placed height (world units). */
  readonly height: number;
}

export function placePoint(p: Vec3, place: Placement): Vec3 {
  const c = Math.cos(place.yaw);
  const s = Math.sin(place.yaw);
  const k = place.scale;
  return [place.position[0] + (p[0] * c + p[2] * s) * k, place.position[1] + p[1] * k, place.position[2] + (-p[0] * s + p[2] * c) * k];
}

function placeDir(d: Vec3, place: Placement): Vec3 {
  const c = Math.cos(place.yaw);
  const s = Math.sin(place.yaw);
  return [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c];
}

function put(out: Float32Array, o: number, a: number, b: number, c: number, d: number) {
  out[o] = a;
  out[o + 1] = b;
  out[o + 2] = c;
  out[o + 3] = d;
}

function putPaint(out: Float32Array, o: number, part: PartPaint, info: FlowerInstanceInfo) {
  put(out, o + 20, info.index, info.phase, part.seed, part.glow);
  put(out, o + 28, part.base[0], part.base[1], part.base[2], part.material);
  put(out, o + 32, part.tip[0], part.tip[1], part.tip[2], part.translucency);
  put(out, o + 36, part.accent[0], part.accent[1], part.accent[2], part.veins);
  put(out, o + 40, info.base[0], info.base[1], info.base[2], info.height);
}

/** i0 = origin, length; i1 = dir, width; i2 = normal, cup; i3 = curl, tipCurl, twist, ruffle; i4 = ruffleFreq, widthPos, tipShape, notch. */
export function packSheet(out: Float32Array, index: number, part: SheetPart, place: Placement, info: FlowerInstanceInfo) {
  const o = index * PART_FLOATS;
  const k = place.scale;
  const origin = placePoint(part.origin, place);
  const dir = placeDir(part.dir, place);
  const normal = placeDir(part.normal, place);
  put(out, o, origin[0], origin[1], origin[2], part.length * k);
  put(out, o + 4, dir[0], dir[1], dir[2], part.width * k);
  put(out, o + 8, normal[0], normal[1], normal[2], part.cup);
  put(out, o + 12, part.curl, part.tipCurl, part.twist, part.ruffle);
  put(out, o + 16, part.ruffleFreq, part.widthPos, part.tipShape, part.notch);
  put(out, o + 24, part.teeth, part.toothDepth, part.baseWidth, part.blend);
  putPaint(out, o, part, info);
}

/** i0..i3 = Bézier points (xyz), with r0 in i0.w and r1 in i1.w. */
export function packTube(out: Float32Array, index: number, part: TubePart, place: Placement, info: FlowerInstanceInfo) {
  const o = index * PART_FLOATS;
  const k = place.scale;
  const points = [part.p0, part.p1, part.p2, part.p3].map((p) => placePoint(p, place));
  put(out, o, points[0]![0], points[0]![1], points[0]![2], part.r0 * k);
  put(out, o + 4, points[1]![0], points[1]![1], points[1]![2], part.r1 * k);
  put(out, o + 8, points[2]![0], points[2]![1], points[2]![2], 0);
  put(out, o + 12, points[3]![0], points[3]![1], points[3]![2], 0);
  put(out, o + 16, 0, 0, 0, 0);
  put(out, o + 24, 0, 0, 0, 0);
  putPaint(out, o, part, info);
}

/** i0 = center, rx; i1 = up, ry; i2 = front, rz; i3 = ribs, ribDepth, squareness, bumps. */
export function packBlob(out: Float32Array, index: number, part: BlobPart, place: Placement, info: FlowerInstanceInfo) {
  const o = index * PART_FLOATS;
  const k = place.scale;
  const center = placePoint(part.center, place);
  const up = placeDir(part.up, place);
  const front = placeDir(part.front, place);
  put(out, o, center[0], center[1], center[2], part.radii[0] * k);
  put(out, o + 4, up[0], up[1], up[2], part.radii[1] * k);
  put(out, o + 8, front[0], front[1], front[2], part.radii[2] * k);
  put(out, o + 12, part.ribs, part.ribDepth, part.squareness, part.bumps);
  put(out, o + 16, 0, 0, 0, 0);
  put(out, o + 24, 0, 0, 0, 0);
  putPaint(out, o, part, info);
}
