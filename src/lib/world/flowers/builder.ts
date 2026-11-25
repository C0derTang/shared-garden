/** Shared construction helpers for the procedural flower species. */

import type { Vec3 } from "../layout";
import {
  UP,
  bezier,
  bezierTangent,
  cross,
  dot,
  linear,
  madd,
  normalize,
  perpendicular,
  rotate,
  scale,
  smoothstep,
  streamFor,
  sub,
  vary,
} from "./math";
import { MATERIAL, type BlobPart, type Rgb, type SheetPart, type TubePart } from "./parts";

export type GrowthStage = "seedling" | "bud" | "opening" | "bloom";

/** Growth fraction (growth / target, clamped to 0..1) to a named stage. */
export function growthStage(fraction: number): GrowthStage {
  if (fraction >= 1) return "bloom";
  if (fraction >= 0.5) return "opening";
  if (fraction >= 0.25) return "bud";
  return "seedling";
}

/** Continuous growth controls derived from the growth fraction. */
export interface Growth {
  readonly fraction: number;
  readonly stage: GrowthStage;
  /** 0..1 how far the stalk has grown toward its final height. */
  readonly stalk: number;
  /** 0..1 size of the flower head (bud through bloom). */
  readonly head: number;
  /** 0 (closed bud) .. 1 (fully open). */
  readonly open: number;
}

export function growthFor(fraction: number): Growth {
  const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return {
    fraction: f,
    stage: growthStage(f),
    stalk: 0.42 + 0.58 * smoothstep(0.2, 0.85, f),
    head: 0.5 + 0.5 * smoothstep(0.25, 1, f),
    open: smoothstep(0.42, 1, f),
  };
}

type SheetInit = Partial<SheetPart> & Pick<SheetPart, "origin" | "dir" | "normal" | "length" | "width" | "base" | "tip">;
type TubeInit = Partial<TubePart> & Pick<TubePart, "p0" | "p1" | "p2" | "p3" | "r0" | "r1" | "base" | "tip">;
type BlobInit = Partial<BlobPart> & Pick<BlobPart, "center" | "radii" | "base">;

/** A local frame at a flower head: `axis` points out of the face of the flower. */
export interface Head {
  readonly center: Vec3;
  readonly axis: Vec3;
  readonly b1: Vec3;
  readonly b2: Vec3;
}

export function headFrame(center: Vec3, axis: Vec3, spin = 0): Head {
  const a = normalize(axis);
  const b1 = rotate(perpendicular(a), a, spin);
  return { center, axis: a, b1, b2: cross(a, b1) };
}

/** Unit vector in the head's plane at azimuth `az`. */
export function radial(head: Head, az: number): Vec3 {
  return normalize(madd(scale(head.b1, Math.cos(az)), head.b2, Math.sin(az)));
}

/**
 * Pose of a petal around a head: `elevation` 0 points along the head axis
 * (closed), π/2 lies flat, beyond π/2 droops back. The front face looks
 * inward/up, toward the flower's centre.
 */
export function petalPose(head: Head, az: number, elevation: number, offset = 0, lift = 0) {
  const r = radial(head, az);
  const c = Math.cos(elevation);
  const s = Math.sin(elevation);
  return {
    origin: madd(madd(head.center, r, offset), head.axis, lift),
    dir: normalize(madd(scale(head.axis, c), r, s)),
    normal: normalize(madd(scale(head.axis, s), r, -c)),
  };
}

/** A cubic-Bézier stalk. */
export interface Stalk {
  readonly points: readonly [Vec3, Vec3, Vec3, Vec3];
  at(t: number): Vec3;
  tangent(t: number): Vec3;
}

export function stalk(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3): Stalk {
  return {
    points: [p0, p1, p2, p3],
    at: (t) => bezier(p0, p1, p2, p3, t),
    tangent: (t) => bezierTangent(p0, p1, p2, p3, t),
  };
}

export interface LeafColors {
  readonly base: Rgb;
  readonly tip: Rgb;
  readonly accent: Rgb;
}

const LEAF_GREENS = ["#2f5a1f", "#3b6b25", "#46702c", "#355f2a", "#4c6f2a"];

/** A species-tinted leaf palette for one plant. */
export function leafColors(random: () => number, hint?: { base?: string; tip?: string; accent?: string }): LeafColors {
  const base = vary(linear(hint?.base ?? LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)]!), random, 0.12);
  const tip = vary(linear(hint?.tip ?? "#7a9a3c"), random, 0.12);
  const accent = vary(linear(hint?.accent ?? "#b7c98a"), random, 0.08);
  return { base, tip, accent };
}

export interface Aura {
  readonly center: Vec3;
  readonly radius: number;
  readonly color: Rgb;
}

/**
 * One seed of a dandelion's seed puff, as the parts that paint it: the dark
 * achene, its slender beak and the pappus umbrella at the tip. `axis` points
 * from the head out through the seed. The parts are also in the plant's part
 * lists; this keeps them together so the seeds can blow away (#201).
 */
export interface PuffSeed {
  readonly axis: Vec3;
  readonly achene: BlobPart;
  readonly beak: TubePart;
  readonly pappus: BlobPart;
}

/** Accumulates the parts of one plant. */
export class PlantBuilder {
  readonly sheets: SheetPart[] = [];
  readonly tubes: TubePart[] = [];
  readonly blobs: BlobPart[] = [];
  aura: Aura | null = null;
  /** A dandelion seed puff's seeds, in order (empty for every other plant). */
  readonly puffSeeds: PuffSeed[] = [];
  private readonly partSeeds: () => number;
  private top = 0;
  private reach = 0;

  constructor(
    readonly seed: number,
    readonly type: string,
    readonly growth: Growth,
    /** How much larger a seedling's shoot is drawn (#214; see `seedlingScaleFor`). Later stages ignore it. */
    readonly seedlingScale = 1,
  ) {
    this.partSeeds = this.stream("part-seeds");
  }

  /** An independent deterministic random stream for one aspect of this plant. */
  stream(name: string): () => number {
    return streamFor(this.seed, `${this.type}:${name}`);
  }

  private track(p: Vec3, pad = 0) {
    this.top = Math.max(this.top, p[1] + pad);
    this.reach = Math.max(this.reach, Math.hypot(p[0], p[2]) + pad);
  }

  /** Height and horizontal reach of everything added so far. */
  bounds() {
    return { height: this.top, radius: this.reach };
  }

  sheet(init: SheetInit): void {
    const part: SheetPart = {
      material: MATERIAL.petal,
      accent: init.tip,
      veins: 0.5,
      translucency: 0.6,
      glow: 0,
      cup: 0,
      curl: 0,
      tipCurl: 0,
      twist: 0,
      ruffle: 0,
      ruffleFreq: 3,
      widthPos: 0.5,
      tipShape: 0.8,
      notch: 0,
      teeth: 0,
      toothDepth: 0,
      baseWidth: 0.1,
      blend: 0.5,
      seed: this.partSeeds(),
      ...init,
    };
    this.sheets.push(part);
    this.track(part.origin);
    this.track(madd(part.origin, part.dir, part.length), part.width * 0.5);
  }

  tube(init: TubeInit): void {
    const part: TubePart = {
      material: MATERIAL.stem,
      accent: init.tip,
      veins: 0.4,
      translucency: 0.3,
      glow: 0,
      seed: this.partSeeds(),
      ...init,
    };
    this.tubes.push(part);
    this.track(part.p3, part.r1);
    this.track(part.p0, part.r0);
  }

  blob(init: BlobInit): void {
    const part: BlobPart = {
      material: MATERIAL.disk,
      tip: init.base,
      accent: init.base,
      veins: 0.3,
      translucency: 0.2,
      glow: 0,
      up: UP,
      front: [0, 0, 1],
      ribs: 0,
      ribDepth: 0,
      squareness: 1,
      bumps: 0,
      seed: this.partSeeds(),
      ...init,
    };
    this.blobs.push(part);
    this.track(part.center, Math.max(...part.radii));
  }

  /** Paints a stalk as one tapered tube. */
  stalkTube(s: Stalk, r0: number, r1: number, colors: { base: Rgb; tip: Rgb; accent?: Rgb }, material: (typeof MATERIAL)[keyof typeof MATERIAL] = MATERIAL.stem) {
    const [p0, p1, p2, p3] = s.points;
    this.tube({ p0, p1, p2, p3, r0, r1, base: colors.base, tip: colors.tip, accent: colors.accent ?? colors.tip, material });
  }

  /** A small swelling node on a stalk where a leaf or petiole joins it. */
  node(s: Stalk, t: number, radius: number, color: Rgb) {
    const up = s.tangent(t);
    this.blob({ material: MATERIAL.stem, center: s.at(t), up, front: perpendicular(up), radii: [radius * 1.35, radius * 1.1, radius * 1.35], base: color, tip: color });
  }

  /** A straight tube between two points. */
  segment(a: Vec3, b: Vec3, r0: number, r1: number, colors: { base: Rgb; tip: Rgb; accent?: Rgb }, material: (typeof MATERIAL)[keyof typeof MATERIAL] = MATERIAL.stem, sag: Vec3 = [0, 0, 0]) {
    const d = sub(b, a);
    this.tube({
      p0: a,
      p1: madd(madd(a, d, 1 / 3), sag, 1),
      p2: madd(madd(a, d, 2 / 3), sag, 1),
      p3: b,
      r0,
      r1,
      base: colors.base,
      tip: colors.tip,
      accent: colors.accent ?? colors.tip,
      material,
    });
  }

  /**
   * A leaf growing from `at` toward horizontal `outward`, rising `rise`
   * radians above the horizon, with its face turned up.
   */
  leaf(
    at: Vec3,
    outward: Vec3,
    rise: number,
    shape: Partial<SheetPart> & { length: number; width: number },
    colors: LeafColors,
    roll = 0,
  ): void {
    const flat = normalize([outward[0], 0, outward[2]]);
    const dir = normalize(madd(scale(flat, Math.cos(rise)), UP, Math.sin(rise)));
    let side = cross(dir, UP);
    if (dot(side, side) < 1e-6) side = perpendicular(dir);
    side = normalize(side);
    const normal = rotate(normalize(cross(side, dir)), dir, roll);
    this.sheet({
      material: MATERIAL.leaf,
      veins: 0.6,
      translucency: 0.45,
      widthPos: 0.42,
      tipShape: 0.9,
      cup: 0.25,
      curl: -0.5,
      baseWidth: 0.05,
      blend: 0.55,
      ...shape,
      origin: at,
      dir,
      normal,
      base: colors.base,
      tip: colors.tip,
      accent: colors.accent,
    });
  }
}
