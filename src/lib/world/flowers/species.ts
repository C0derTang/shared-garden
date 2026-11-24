/**
 * Morphology of the thirteen garden flowers. Every builder reads its random
 * traits from named streams of the plant's seed, so a plant keeps its identity
 * (colour, petal count, stalk curve, leaves) through every growth stage.
 */

import type { FlowerType } from "@/lib/garden-v2/model";
import type { Vec3 } from "../layout";
import {
  PlantBuilder,
  headFrame,
  leafColors,
  petalPose,
  radial,
  stalk,
  type Head,
  type LeafColors,
} from "./builder";
import {
  GOLDEN_ANGLE,
  UP,
  add,
  clamp,
  cross,
  dot,
  lerp,
  linear,
  madd,
  mixRgb,
  normalize,
  scale,
  scaleRgb,
  smoothstep,
  vary,
} from "./math";
import { MATERIAL, type Rgb } from "./parts";

export interface SpeciesOptions {
  /** Linear colours chosen by mood (hydrangea florets). */
  readonly moods: readonly Rgb[];
  /** Dandelion has gone to seed. */
  readonly puff: boolean;
}

type Builder = (b: PlantBuilder, options: SpeciesOptions) => void;

interface Variant {
  readonly name: string;
  readonly base: string;
  readonly tip: string;
  readonly accent?: string;
  readonly veins?: number;
  readonly blend?: number;
  readonly weight?: number;
}

interface Paint {
  readonly name: string;
  readonly base: Rgb;
  readonly tip: Rgb;
  readonly accent: Rgb;
  readonly veins: number;
  readonly blend: number;
}

function pickVariant(random: () => number, variants: readonly Variant[]): Paint {
  const total = variants.reduce((sum, v) => sum + (v.weight ?? 1), 0);
  let roll = random() * total;
  let chosen = variants[0]!;
  for (const v of variants) {
    roll -= v.weight ?? 1;
    if (roll <= 0) {
      chosen = v;
      break;
    }
  }
  return {
    name: chosen.name,
    base: vary(linear(chosen.base), random, 0.07),
    tip: vary(linear(chosen.tip), random, 0.07),
    accent: vary(linear(chosen.accent ?? chosen.base), random, 0.05),
    veins: chosen.veins ?? 0.4,
    blend: chosen.blend ?? 0.5,
  };
}

const jitter = (random: () => number, amount: number) => (random() * 2 - 1) * amount;
const range = (random: () => number, lo: number, hi: number) => lo + random() * (hi - lo);
const int = (random: () => number, lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

function horizontal(az: number): Vec3 {
  return [Math.cos(az), 0, Math.sin(az)];
}

/** Turns `axis` partway toward the viewer side (+z) so heads face the camera. */
function faceViewer(axis: Vec3, amount: number): Vec3 {
  return normalize(madd(normalize(axis), normalize([0, 0.35, 1]), amount));
}

function stemPaint(random: () => number, base = "#3e5d22", tip = "#6a8a32"): { base: Rgb; tip: Rgb; accent: Rgb } {
  return { base: vary(linear(base), random, 0.1), tip: vary(linear(tip), random, 0.1), accent: vary(linear("#a7b874"), random, 0.08) };
}

/** A rising stalk with a natural bow; `lean` and `bow` are horizontal offsets. */
function bowedStalk(random: () => number, height: number, lean: Vec3, bow = 0.04) {
  const wob = (): Vec3 => [jitter(random, bow), 0, jitter(random, bow)];
  const w1 = wob();
  const w2 = wob();
  return stalk(
    [0, 0, 0],
    [lean[0] * 0.1 + w1[0], height * 0.36, lean[2] * 0.1 + w1[2]],
    [lean[0] * 0.75 + w2[0], height * 0.72, lean[2] * 0.75 + w2[2]],
    [lean[0], height, lean[2]],
  );
}

/** Seedling: a short shoot with two cotyledons, then the first true leaves. */
function seedling(b: PlantBuilder, leaf: LeafColors, kind: "dicot" | "strap", trueLeaf: { teeth?: number; toothDepth?: number; widthPos?: number } = {}) {
  const r = b.stream("seedling");
  const sprout = smoothstep(0, 0.25, b.growth.fraction);
  const size = 0.45 + 0.55 * sprout;
  const spin = r() * Math.PI * 2;
  if (kind === "strap") {
    const count = 2 + (sprout > 0.5 ? 1 : 0);
    for (let i = 0; i < count; i += 1) {
      b.leaf([0, 0, 0], horizontal(spin + i * 2.3 + jitter(r, 0.3)), 1.25 + jitter(r, 0.15), {
        length: (0.07 + 0.06 * size) * (1 - i * 0.2),
        width: 0.014,
        widthPos: 0.3,
        tipShape: 1.3,
        curl: -0.5,
        cup: 0.7,
        baseWidth: 0.45,
      }, leaf, jitter(r, 0.3));
    }
    return;
  }
  const h = 0.04 + 0.06 * size;
  const top: Vec3 = [jitter(r, 0.01), h, jitter(r, 0.01)];
  b.segment([0, 0, 0], top, 0.0045, 0.0035, { base: vary(linear("#6d7f3a"), r, 0.1), tip: leaf.tip }, MATERIAL.stem, [jitter(r, 0.008), 0, 0]);
  for (const side of [0, Math.PI]) {
    b.leaf(top, horizontal(spin + side), 0.35 + jitter(r, 0.1), { length: 0.02 + 0.022 * size, width: 0.018 * size + 0.006, widthPos: 0.55, tipShape: 0.5, curl: -0.25, cup: 0.35, veins: 0.25 }, leaf);
  }
  if (sprout > 0.45) {
    const grow = smoothstep(0.45, 1, sprout);
    for (const side of [Math.PI / 2, -Math.PI / 2]) {
      b.leaf(add(top, [0, 0.004, 0]), horizontal(spin + side), 0.9, {
        length: 0.012 + 0.03 * grow,
        width: 0.008 + 0.014 * grow,
        widthPos: trueLeaf.widthPos ?? 0.45,
        tipShape: 0.85,
        teeth: trueLeaf.teeth ?? 0,
        toothDepth: trueLeaf.toothDepth ?? 0,
        curl: -0.3,
        cup: 0.3,
      }, leaf);
    }
  }
}

/** A filament with an anther: stamens of lilies, tulips, peonies and more. */
function stamen(b: PlantBuilder, from: Vec3, to: Vec3, radius: number, filament: Rgb, anther: Rgb, antherSize: number, sag: Vec3 = [0, 0, 0]) {
  b.segment(from, to, radius, radius * 0.7, { base: filament, tip: filament }, MATERIAL.filament, sag);
  const d = normalize([to[0] - from[0], to[1] - from[1], to[2] - from[2]]);
  b.blob({
    material: MATERIAL.anther,
    center: madd(to, d, antherSize * 0.4),
    up: d,
    front: normalize(cross(d, Math.abs(d[1]) < 0.9 ? UP : [1, 0, 0])),
    radii: [antherSize * 0.45, antherSize, antherSize * 0.45],
    base: anther,
    tip: scaleRgb(anther, 1.25),
    bumps: 0.6,
  });
}

/** Superellipsoid surface point matching `blobLocal` in flower.wgsl. */
function blobSurface(center: Vec3, up: Vec3, front: Vec3, radii: Vec3, ribs: number, ribDepth: number, squareness: number, theta: number, phi: number) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const y = Math.sign(c) * Math.abs(c) ** squareness * radii[1];
  const hr = Math.abs(s) ** squareness;
  const rib = ribs > 0 ? 1 - ribDepth * (1 - Math.abs(Math.cos(ribs * phi * 0.5)) ** 1.5) : 1;
  const x = hr * Math.cos(phi) * radii[0] * rib;
  const z = hr * Math.sin(phi) * radii[2] * rib;
  const right = cross(up, front);
  const point = madd(madd(madd(center, right, x), up, y), front, z);
  const outward = normalize(madd(madd(scale(right, Math.cos(phi) * s / radii[0]), up, c / radii[1]), front, Math.sin(phi) * s / radii[2]));
  return { point, outward };
}

// ---------------------------------------------------------------------------
// Rose

const ROSE: readonly Variant[] = [
  { name: "crimson", base: "#6e0716", tip: "#c8172f", accent: "#4a0410", veins: 0.35 },
  { name: "scarlet", base: "#9b0d1c", tip: "#e2283a", accent: "#6b0712", veins: 0.3 },
  { name: "pink", base: "#b8325d", tip: "#f2a0bb", accent: "#9c2a4d", veins: 0.35 },
  { name: "blush", base: "#e3a7a6", tip: "#fbe2dc", accent: "#cf8d8e", veins: 0.3 },
  { name: "coral", base: "#cf4a3a", tip: "#f9a27f", accent: "#a83a2d", veins: 0.35 },
  { name: "yellow", base: "#d98c10", tip: "#f9da66", accent: "#c27410", veins: 0.3, weight: 0.6 },
  { name: "cream", base: "#e8cfa6", tip: "#fcf4e6", accent: "#d6b88c", veins: 0.25, weight: 0.6 },
];

const rose: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, ROSE);
  const height = range(t, 0.62, 0.84);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#2a4a1b", tip: "#58772c", accent: "#97a868" });
  const stemColor = stemPaint(t, "#3c5a20", "#566c26");
  const petalCount = int(t, 24, 38);
  const headSize = range(t, 0.1, 0.13);
  const lean: Vec3 = [jitter(t, 0.1), 0, jitter(t, 0.08) + 0.03];
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { teeth: 7, toothDepth: 0.15 });
  const g = b.growth;
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, lean, 0.05);
  b.stalkTube(s, 0.013, 0.009, stemColor);

  const thorns = b.stream("thorns");
  const thornCount = int(thorns, 4, 8);
  const thornColor = { base: vary(linear("#6f3a24"), thorns, 0.1), tip: vary(linear("#c08a5a"), thorns, 0.1) };
  for (let i = 0; i < thornCount; i += 1) {
    const at = 0.1 + thorns() * 0.72;
    const p = s.at(at);
    const out = horizontal(thorns() * Math.PI * 2);
    b.segment(madd(p, out, 0.006), add(madd(p, out, 0.02), [0, -0.006, 0]), 0.0035, 0.0002, thornColor, MATERIAL.spine);
  }

  const lv = b.stream("leaves");
  const leafCount = int(lv, 2, 3);
  for (let i = 0; i < leafCount; i += 1) {
    const at = 0.22 + i * 0.22 + lv() * 0.08;
    const base = s.at(at);
    const az = spin + i * 2.4 + jitter(lv, 0.4);
    const out = horizontal(az);
    const end = add(madd(base, out, 0.075), [0, 0.025, 0]);
    b.segment(base, end, 0.0035, 0.0025, stemColor);
    const side = horizontal(az + Math.PI / 2);
    const leaflet = { length: range(lv, 0.045, 0.058), width: range(lv, 0.028, 0.034), teeth: 9, toothDepth: 0.12, widthPos: 0.45, tipShape: 0.75, curl: -0.35, cup: 0.35, veins: 0.6 };
    b.leaf(end, out, 0.15, leaflet, leaf, jitter(lv, 0.2));
    for (const k of [0.45, 0.85]) {
      const p = madd(base, [end[0] - base[0], end[1] - base[1], end[2] - base[2]], k);
      for (const sgn of [-1, 1]) {
        b.leaf(p, normalize(madd(scale(side, sgn), out, 0.6)), 0.2, { ...leaflet, length: leaflet.length * (0.7 + k * 0.25), width: leaflet.width * 0.85 }, leaf, jitter(lv, 0.3));
      }
    }
  }

  const tip = s.at(1);
  const head = headFrame(tip, faceViewer(s.tangent(1), 0.25), spin);
  const size = headSize * g.head;
  b.blob({ material: MATERIAL.stem, center: madd(tip, head.axis, -0.004), up: head.axis, front: head.b1, radii: [0.012, 0.014, 0.012], base: stemColor.tip, tip: leaf.tip });
  for (let k = 0; k < 5; k += 1) {
    const pose = petalPose(head, (k / 5) * Math.PI * 2 + jitter(lv, 0.2), lerp(0.25, 2.05, g.open), 0.006, 0.004);
    b.sheet({ material: MATERIAL.leaf, ...pose, length: size * 0.7, width: size * 0.16, tipShape: 1.5, widthPos: 0.3, curl: -0.5 * g.open, tipCurl: -0.4 * g.open, base: leaf.base, tip: leaf.tip, accent: leaf.accent, veins: 0.25, teeth: 3, toothDepth: 0.4 });
  }
  const pr = b.stream("petals");
  for (let i = 0; i < petalCount; i += 1) {
    const k = i / (petalCount - 1);
    const az = i * GOLDEN_ANGLE + jitter(pr, 0.15);
    const len = size * lerp(0.42, 1, k ** 0.6) * range(pr, 0.92, 1.08);
    const elevation = lerp(lerp(0.03, 0.2, k), lerp(0.1, 1.38, k ** 1.4) + jitter(pr, 0.08), g.open);
    const pose = petalPose(head, az, elevation, k * 0.011 * g.head, -k * 0.012 * g.head);
    const shade = lerp(0.45, 1, k ** 0.8);
    b.sheet({
      ...pose,
      length: len,
      width: len * lerp(1.05, 1.3, k),
      cup: lerp(1.15, 0.55, k),
      curl: lerp(1.0, 0.3, k) * lerp(1.2, 1, g.open),
      tipCurl: -lerp(0, 1.7, k ** 1.5) * g.open,
      twist: jitter(pr, 0.2),
      ruffle: range(pr, 0.07, 0.16),
      ruffleFreq: range(pr, 1.8, 3.2),
      widthPos: 0.64,
      tipShape: 0.5,
      notch: pr() < 0.25 ? 0.025 : 0,
      baseWidth: 0.25,
      base: vary(scaleRgb(paint.base, shade), pr, 0.05),
      tip: vary(scaleRgb(paint.tip, lerp(0.8, 1, k)), pr, 0.05),
      accent: paint.accent,
      veins: paint.veins,
      translucency: 0.55,
      blend: 0.6,
    });
  }
  b.aura = { center: madd(tip, head.axis, size * 0.35), radius: size * 2.6, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Tulip

const TULIP: readonly Variant[] = [
  { name: "red", base: "#2b0c18", tip: "#d11c2b", accent: "#8c0f1d", blend: 0.14, veins: 0.4 },
  { name: "red-gold", base: "#e5ae1a", tip: "#cc1f2c", accent: "#a3121f", blend: 0.2, veins: 0.4 },
  { name: "yellow", base: "#d28c08", tip: "#f9d63d", accent: "#c98a0a", veins: 0.35 },
  { name: "pink", base: "#e9c7d2", tip: "#e2608e", accent: "#c34a74", blend: 0.45, veins: 0.45 },
  { name: "purple", base: "#1e0f2a", tip: "#6a2c86", accent: "#4a1d60", blend: 0.25, veins: 0.4 },
  { name: "white", base: "#c9d7b2", tip: "#f8f6f0", accent: "#dcdccb", blend: 0.3, veins: 0.3, weight: 0.6 },
  { name: "orange", base: "#c23a12", tip: "#f69a3c", accent: "#a52c0e", veins: 0.4 },
  { name: "flame", base: "#f2c63e", tip: "#f6d55a", accent: "#c41e2e", veins: 0.95, weight: 0.8 },
];

const tulip: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, TULIP);
  const height = range(t, 0.5, 0.68);
  const lilyFlowered = t() < 0.25;
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#3b5d37", tip: "#7f9b68", accent: "#adc29a" });
  const stemColor = stemPaint(t, "#4c6e3c", "#7a9658");
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "strap");
  const g = b.growth;
  const lv = b.stream("leaves");
  const leafCount = int(lv, 2, 3);
  for (let i = 0; i < leafCount; i += 1) {
    b.leaf([0, 0.005, 0], horizontal(spin + i * 2.5 + jitter(lv, 0.3)), range(lv, 1.05, 1.3), {
      length: range(lv, 0.3, 0.42) * lerp(0.7, 1, g.stalk),
      width: range(lv, 0.07, 0.095),
      widthPos: 0.3,
      tipShape: 1.15,
      cup: 0.95,
      curl: -range(lv, 0.6, 1.1),
      ruffle: range(lv, 0.06, 0.14),
      ruffleFreq: 3,
      baseWidth: 0.55,
      veins: 0.35,
    }, leaf, jitter(lv, 0.25));
  }
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.05), 0, jitter(t, 0.04)], 0.025);
  b.stalkTube(s, 0.012, 0.01, stemColor);
  const tip = s.at(1);
  const head = headFrame(tip, s.tangent(1), spin);
  const size = range(t, 0.085, 0.11) * g.head;
  const pr = b.stream("petals");
  const openElevation = lilyFlowered ? range(t, 0.55, 0.75) : range(t, 0.36, 0.55);
  for (let whorl = 0; whorl < 2; whorl += 1) {
    for (let j = 0; j < 3; j += 1) {
      const az = (j / 3) * Math.PI * 2 + whorl * (Math.PI / 3) + jitter(pr, 0.08);
      const pose = petalPose(head, az, lerp(0.05, openElevation - whorl * 0.06, g.open), 0.008, 0.002 * whorl);
      const len = size * (1 - whorl * 0.05) * range(pr, 0.96, 1.04);
      b.sheet({
        ...pose,
        length: len,
        width: len * (lilyFlowered ? 0.46 : 0.74),
        cup: lilyFlowered ? 0.7 : 1.15,
        curl: lilyFlowered ? -0.05 : 0.14,
        tipCurl: lilyFlowered ? -0.9 * g.open : -0.15 * g.open,
        twist: jitter(pr, 0.12),
        ruffle: range(pr, 0.02, 0.06),
        ruffleFreq: 2,
        widthPos: lilyFlowered ? 0.45 : 0.6,
        tipShape: lilyFlowered ? 1.4 : 0.62,
        baseWidth: lilyFlowered ? 0.3 : 0.55,
        base: vary(paint.base, pr, 0.04),
        tip: vary(paint.tip, pr, 0.04),
        accent: paint.accent,
        veins: paint.veins,
        blend: paint.blend,
        translucency: 0.6,
      });
    }
  }
  b.blob({ material: MATERIAL.stem, center: madd(tip, head.axis, -0.002), up: head.axis, front: head.b1, radii: [0.0115, 0.007, 0.0115], base: stemColor.tip, tip: stemColor.tip });
  const center = madd(tip, head.axis, 0.004);
  b.blob({ material: MATERIAL.stem, center: madd(center, head.axis, 0.016), up: head.axis, front: head.b1, radii: [0.0065, 0.016, 0.0065], ribs: 3, ribDepth: 0.2, base: linear("#b6c27a"), tip: linear("#e7e3a2") });
  const antherColor = paint.name === "yellow" || paint.name === "white" ? linear("#c99a2e") : linear("#2a1a24");
  for (let j = 0; j < 6; j += 1) {
    const r = radial(head, (j / 6) * Math.PI * 2 + 0.5);
    stamen(b, madd(center, r, 0.004), madd(madd(center, head.axis, 0.026), r, 0.009), 0.0012, linear("#3b2a2a"), antherColor, 0.0065);
  }
  b.aura = { center: madd(tip, head.axis, size * 0.5), radius: size * 2.4, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Marigold

const MARIGOLD: readonly Variant[] = [
  { name: "orange", base: "#c23f08", tip: "#f7a114", accent: "#8f2607", veins: 0.45 },
  { name: "gold", base: "#d98b00", tip: "#ffcf35", accent: "#b06300", veins: 0.4 },
  { name: "red-gold", base: "#6e140c", tip: "#e9a01e", accent: "#4d0c06", veins: 0.6, blend: 0.38 },
  { name: "lemon", base: "#e2b511", tip: "#fff08a", accent: "#c18e08", veins: 0.3, weight: 0.6 },
];

function pinnateLeaf(b: PlantBuilder, at: Vec3, az: number, length: number, leaf: LeafColors, stemColor: { base: Rgb; tip: Rgb }, random: () => number) {
  const out = horizontal(az);
  const end = add(madd(at, out, length), [0, length * 0.25, 0]);
  b.segment(at, end, 0.0025, 0.0015, stemColor, MATERIAL.stem, [0, length * 0.1, 0]);
  const side = horizontal(az + Math.PI / 2);
  const pairs = 3 + Math.floor(random() * 2);
  for (let i = 0; i < pairs; i += 1) {
    const k = 0.25 + (i / pairs) * 0.7;
    const p = madd(at, [end[0] - at[0], end[1] - at[1], end[2] - at[2]], k);
    for (const sgn of [-1, 1]) {
      b.leaf(p, normalize(madd(scale(side, sgn), out, 0.8)), 0.15, { length: length * 0.4 * (1 - k * 0.4), width: length * 0.1, widthPos: 0.45, tipShape: 1.2, teeth: 6, toothDepth: 0.25, curl: -0.3, cup: 0.3 }, leaf, jitter(random, 0.3));
    }
  }
  b.leaf(end, out, 0.2, { length: length * 0.35, width: length * 0.1, widthPos: 0.45, tipShape: 1.2, teeth: 6, toothDepth: 0.25, curl: -0.3 }, leaf);
}

const marigold: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, MARIGOLD);
  const height = range(t, 0.42, 0.56);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#253f19", tip: "#4f6d2a", accent: "#88a060" });
  const stemColor = stemPaint(t, "#3d5a22", "#5d7a2c");
  const rings = int(t, 6, 8);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { teeth: 5, toothDepth: 0.25 });
  const g = b.growth;
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.06), 0, jitter(t, 0.05) + 0.02], 0.04);
  b.stalkTube(s, 0.009, 0.0075, stemColor);
  const lv = b.stream("leaves");
  const leafCount = int(lv, 3, 4);
  for (let i = 0; i < leafCount; i += 1) {
    pinnateLeaf(b, s.at(0.15 + i * 0.17), spin + i * 2.2 + jitter(lv, 0.3), range(lv, 0.08, 0.11), leaf, stemColor, lv);
  }
  const tip = s.at(1);
  const head = headFrame(tip, faceViewer(s.tangent(1), 0.3), spin);
  const R = range(t, 0.075, 0.095) * g.head;
  b.blob({ material: MATERIAL.leaf, center: madd(tip, head.axis, -0.01), up: head.axis, front: head.b1, radii: [0.018, 0.026, 0.018], ribs: 5, ribDepth: 0.12, base: leaf.base, tip: leaf.tip });
  const pr = b.stream("petals");
  for (let ring = 0; ring < rings; ring += 1) {
    const k = ring / (rings - 1);
    const count = Math.round(lerp(15, 7, k));
    for (let j = 0; j < count; j += 1) {
      const az = (j / count) * Math.PI * 2 + ring * 0.7 + jitter(pr, 0.2);
      const len = R * lerp(0.82, 0.42, k) * range(pr, 0.9, 1.1);
      const elevation = lerp(0.08, lerp(1.42, 0.35, k) + jitter(pr, 0.12), g.open);
      const pose = petalPose(head, az, elevation, R * 0.3 * (1 - k) * g.open, R * 0.28 * k * g.open);
      b.sheet({
        ...pose,
        length: len,
        width: len * range(pr, 0.85, 1.05),
        cup: 0.55,
        curl: lerp(-0.1, 0.4, k),
        twist: jitter(pr, 0.3),
        ruffle: range(pr, 0.25, 0.4),
        ruffleFreq: range(pr, 3, 4.5),
        widthPos: 0.74,
        tipShape: 0.35,
        teeth: 4,
        toothDepth: 0.14,
        baseWidth: 0.12,
        base: vary(paint.base, pr, 0.06),
        tip: vary(scaleRgb(paint.tip, lerp(1, 0.9, k)), pr, 0.06),
        accent: paint.accent,
        veins: paint.veins,
        blend: paint.blend,
        translucency: 0.5,
      });
    }
  }
  b.aura = { center: madd(tip, head.axis, R * 0.3), radius: R * 2.6, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Daisy

const DAISY: readonly Variant[] = [
  { name: "white", base: "#e3e1d4", tip: "#fbfaf4", accent: "#d4cfbf", veins: 0.35, weight: 3 },
  { name: "pink-tipped", base: "#fbf5f2", tip: "#f2a0bd", accent: "#e7c3cf", veins: 0.3, blend: 0.78 },
  { name: "blush", base: "#f2dfe7", tip: "#fff6f8", accent: "#e3c8d3", veins: 0.3 },
];

/** A composite disk of tiny florets in golden-angle phyllotaxis. */
function floretDisk(b: PlantBuilder, head: Head, radius: number, dome: number, count: number, inner: Rgb, outer: Rgb, florSize: number, random: () => number, pollen?: Rgb) {
  for (let j = 0; j < count; j += 1) {
    const k = Math.sqrt((j + 0.5) / count);
    const rr = radius * 0.96 * k;
    const r = radial(head, j * GOLDEN_ANGLE);
    const h = dome * Math.sqrt(Math.max(0, 1 - k * k));
    const center = madd(madd(head.center, r, rr), head.axis, h);
    const up = normalize(madd(head.axis, r, k * (dome / Math.max(radius, 1e-4)) * 1.2));
    const color = pollen && k > 0.78 && random() < 0.3 ? mixRgb(pollen, outer, random() * 0.5) : mixRgb(inner, outer, k);
    b.blob({ material: MATERIAL.disk, center, up, front: normalize(cross(up, head.b2)), radii: [florSize, florSize * 0.9, florSize], base: vary(color, random, 0.12), tip: scaleRgb(color, 1.5), bumps: 0.4, ribs: 5, ribDepth: 0.12 });
  }
}

const daisy: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, DAISY);
  const height = range(t, 0.4, 0.56);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#30561f", tip: "#6b8a35" });
  const stemColor = stemPaint(t, "#4a6a2a", "#6f8c3a");
  const rays = int(t, 21, 34);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { widthPos: 0.7, teeth: 4, toothDepth: 0.12 });
  const g = b.growth;
  const lv = b.stream("leaves");
  const rosette = int(lv, 4, 6);
  for (let i = 0; i < rosette; i += 1) {
    b.leaf([0, 0.004, 0], horizontal(spin + (i / rosette) * Math.PI * 2 + jitter(lv, 0.3)), range(lv, 0.25, 0.5), {
      length: range(lv, 0.08, 0.11),
      width: range(lv, 0.026, 0.034),
      widthPos: 0.74,
      tipShape: 0.55,
      teeth: 4,
      toothDepth: 0.14,
      curl: -0.4,
      cup: 0.3,
    }, leaf, jitter(lv, 0.3));
  }
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.08), 0, jitter(t, 0.06) + 0.03], 0.05);
  b.stalkTube(s, 0.0062, 0.005, stemColor);
  b.leaf(s.at(0.35), horizontal(spin + 1.3), 0.5, { length: 0.04, width: 0.01, widthPos: 0.4, tipShape: 1.1, curl: -0.3 }, leaf);
  const tip = s.at(1);
  const head = headFrame(tip, faceViewer(s.tangent(1), 0.45), spin);
  const R = range(t, 0.085, 0.105) * g.head;
  const D = range(t, 0.021, 0.027) * g.head;
  const pr = b.stream("petals");
  for (let k = 0; k < 13; k += 1) {
    const pose = petalPose(head, (k / 13) * Math.PI * 2, lerp(0.15, 1.65, g.open), D * 0.6, -0.004);
    b.sheet({ material: MATERIAL.leaf, ...pose, length: 0.02, width: 0.007, tipShape: 1.2, widthPos: 0.4, base: leaf.base, tip: leaf.tip, veins: 0.2 });
  }
  for (let i = 0; i < rays; i += 1) {
    const az = (i / rays) * Math.PI * 2 + jitter(pr, 0.06);
    const pose = petalPose(head, az, lerp(0.12, 1.52 + jitter(pr, 0.13) + 0.05, g.open), D * 0.85, 0.001);
    b.sheet({
      ...pose,
      length: R * range(pr, 0.86, 1.08),
      width: range(pr, 0.016, 0.021) * g.head,
      cup: range(pr, 0.15, 0.4),
      curl: jitter(pr, 0.25) - 0.08,
      tipCurl: jitter(pr, 0.2),
      twist: jitter(pr, 0.35),
      ruffle: 0.05,
      ruffleFreq: 2,
      widthPos: 0.62,
      tipShape: 0.6,
      notch: range(pr, 0.04, 0.08),
      baseWidth: 0.25,
      base: vary(paint.base, pr, 0.03),
      tip: vary(paint.tip, pr, 0.03),
      accent: paint.accent,
      veins: paint.veins,
      blend: paint.blend,
      translucency: 0.75,
    });
  }
  const diskHead = headFrame(madd(tip, head.axis, 0.003), head.axis, spin);
  b.blob({ material: MATERIAL.disk, center: diskHead.center, up: head.axis, front: head.b1, radii: [D, D * 0.5, D], base: linear("#c98f08"), tip: linear("#f4bf22"), bumps: 0.7 });
  const greenDisk = 1 - g.open;
  floretDisk(b, diskHead, D, D * 0.5, Math.round(lerp(50, 90, R / 0.105)), mixRgb(linear("#b9860a"), linear("#7d8a2a"), greenDisk), mixRgb(linear("#f2b416"), linear("#9aa83a"), greenDisk), 0.0028 * g.head + 0.0008, pr);
  b.aura = { center: madd(tip, head.axis, 0.01), radius: R * 2.4, color: mixRgb(paint.tip, linear("#f7d36a"), 0.25) };
};

// ---------------------------------------------------------------------------
// Hydrangea

const HYDRANGEA: readonly Variant[] = [
  { name: "blue", base: "#9fb6e6", tip: "#4f74cf", accent: "#3e5fae" },
  { name: "pink", base: "#f1c3d6", tip: "#df7fae", accent: "#bb5f8c" },
  { name: "lavender", base: "#d5c9ef", tip: "#9a82d6", accent: "#7a62b6" },
  { name: "white", base: "#dfe8cf", tip: "#f7f7f0", accent: "#c8d6b4", weight: 0.6 },
];

const hydrangea: Builder = (b, options) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, HYDRANGEA);
  const height = range(t, 0.5, 0.66);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#284a1c", tip: "#557a2c", accent: "#8ea866" });
  const stemColor = stemPaint(t, "#4d5a2a", "#6a7a34");
  const florets = int(t, 58, 74);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { teeth: 9, toothDepth: 0.14 });
  const g = b.growth;
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.05), 0, jitter(t, 0.05) + 0.02], 0.03);
  b.stalkTube(s, 0.011, 0.008, stemColor);
  const lv = b.stream("leaves");
  for (const [at, az] of [[0.32, 0], [0.58, Math.PI / 2]] as const) {
    for (const sgn of [0, Math.PI]) {
      const p = s.at(at);
      const out = horizontal(spin + az + sgn + jitter(lv, 0.2));
      const base = add(madd(p, out, 0.018), [0, 0.006, 0]);
      b.segment(p, base, 0.003, 0.0025, stemColor);
      b.leaf(base, out, range(lv, 0.1, 0.35), { length: range(lv, 0.1, 0.13), width: range(lv, 0.065, 0.08), teeth: 11, toothDepth: 0.13, widthPos: 0.45, tipShape: 0.9, curl: -0.55, cup: 0.4, ruffle: 0.06 }, leaf, jitter(lv, 0.25));
    }
  }
  const tip = s.at(1);
  const axis = faceViewer(s.tangent(1), 0.2);
  const R = range(t, 0.1, 0.125) * g.head;
  const center = madd(tip, axis, R * 0.55);
  const head = headFrame(center, axis, spin);
  const palette = options.moods.length > 0 ? options.moods : [paint.tip];
  const fr = b.stream("florets");
  const green = linear("#a9c27c");
  b.blob({ material: MATERIAL.leaf, center, up: axis, front: head.b1, radii: [R * 0.72, R * 0.62, R * 0.72], base: scaleRgb(leaf.base, 0.5), tip: leaf.base, bumps: 0.3 });
  for (let f = 0; f < florets; f += 1) {
    const yy = 1 - ((f + 0.5) / florets) * 1.5;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const az = f * GOLDEN_ANGLE;
    const n = normalize(madd(madd(scale(axis, yy), head.b1, rr * Math.cos(az)), head.b2, rr * Math.sin(az)));
    const fc = madd(center, n, R * range(fr, 0.9, 1.02));
    const hue = palette[Math.floor(fr() * palette.length)]!;
    const color = mixRgb(green, vary(hue, fr, 0.08), smoothstep(0.1, 0.9, g.open));
    const floretSize = range(fr, 0.03, 0.038) * lerp(0.6, 1, g.open);
    if (g.open < 0.08) {
      b.blob({ material: MATERIAL.leaf, center: fc, up: n, front: perpendicularTo(n), radii: [0.009, 0.007, 0.009], base: green, tip: linear("#d3e0b0"), bumps: 0.4 });
      continue;
    }
    const floret = headFrame(fc, n, fr() * Math.PI * 2);
    for (let k = 0; k < 4; k += 1) {
      const pose = petalPose(floret, (k / 4) * Math.PI * 2 + jitter(fr, 0.15), lerp(0.25, 1.4, g.open) + jitter(fr, 0.1), 0.0015);
      b.sheet({
        ...pose,
        length: floretSize * range(fr, 0.9, 1.1),
        width: floretSize * range(fr, 0.85, 1.05),
        cup: range(fr, 0.2, 0.5),
        curl: jitter(fr, 0.3),
        twist: jitter(fr, 0.25),
        ruffle: range(fr, 0.04, 0.12),
        ruffleFreq: 2,
        widthPos: 0.58,
        tipShape: 0.42,
        baseWidth: 0.15,
        base: mixRgb(color, linear("#f4f2e8"), 0.35),
        tip: color,
        accent: scaleRgb(color, 0.7),
        veins: 0.45,
        blend: 0.45,
        translucency: 0.7,
      });
    }
    b.blob({ material: MATERIAL.anther, center: madd(fc, n, 0.002), up: n, front: floret.b1, radii: [0.0028, 0.0028, 0.0028], base: scaleRgb(color, 0.6), tip: linear("#f2efe0"), bumps: 0.4 });
  }
  b.aura = { center, radius: R * 2.4, color: palette[0]! };
};

function perpendicularTo(n: Vec3): Vec3 {
  return normalize(cross(n, Math.abs(n[1]) < 0.9 ? UP : [1, 0, 0]));
}

// ---------------------------------------------------------------------------
// Sunflower

const SUNFLOWER: readonly Variant[] = [
  { name: "classic", base: "#e39a00", tip: "#ffcb2e", accent: "#b97300", veins: 0.5, weight: 3 },
  { name: "lemon", base: "#efc81e", tip: "#fff08a", accent: "#c8a010", veins: 0.4 },
  { name: "autumn", base: "#8a230b", tip: "#f2a22a", accent: "#6a1808", veins: 0.6, blend: 0.42 },
];

const sunflower: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, SUNFLOWER);
  const height = range(t, 0.85, 1.1);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#335a1f", tip: "#6d8c30", accent: "#a5b96e" });
  const stemColor = stemPaint(t, "#4b6a28", "#6d8a35");
  const rays = int(t, 21, 30);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { teeth: 7, toothDepth: 0.08, widthPos: 0.35 });
  const g = b.growth;
  const h = height * g.stalk;
  const sr = b.stream("stalk");
  const lean = jitter(sr, 0.06);
  const s = stalk([0, 0, 0], [jitter(sr, 0.03), h * 0.4, jitter(sr, 0.03)], [lean * 0.8, h * 0.86, -0.03], [lean, h, 0.05 * g.open]);
  b.stalkTube(s, 0.02, 0.013, stemColor);
  const lv = b.stream("leaves");
  const leafCount = int(lv, 4, 6);
  for (let i = 0; i < leafCount; i += 1) {
    const at = 0.14 + (i / leafCount) * 0.62;
    const p = s.at(at);
    const out = horizontal(spin + i * 2.4 + jitter(lv, 0.3));
    const base = add(madd(p, out, 0.04), [0, 0.012, 0]);
    b.segment(p, base, 0.005, 0.004, stemColor, MATERIAL.stem, [0, 0.008, 0]);
    const size = 1 - at * 0.45;
    b.leaf(base, out, range(lv, 0.05, 0.3), { length: range(lv, 0.14, 0.18) * size, width: 0.115 * size, widthPos: 0.3, tipShape: 0.95, teeth: 10, toothDepth: 0.08, baseWidth: 0.12, curl: -0.7, cup: 0.25, ruffle: 0.08 }, leaf, jitter(lv, 0.2));
  }
  const tip = s.at(1);
  const axis = normalize(madd(s.tangent(1), normalize([0, 0.15, 1]), 0.25 + g.open * 1.6));
  const head = headFrame(tip, axis, spin);
  const D = range(t, 0.07, 0.09) * g.head;
  const pr = b.stream("petals");
  b.blob({ material: MATERIAL.stem, center: madd(tip, axis, -0.004), up: axis, front: head.b1, radii: [D * 0.98, 0.016, D * 0.98], base: stemColor.base, tip: stemColor.tip });
  for (let k = 0; k < 18; k += 1) {
    const pose = petalPose(head, (k / 18) * Math.PI * 2 + 0.1, lerp(0.35, 1.85, g.open), D * 0.85, -0.008);
    b.sheet({ material: MATERIAL.leaf, ...pose, length: D * 0.45, width: D * 0.22, tipShape: 1.4, widthPos: 0.35, curl: -0.4, base: leaf.base, tip: leaf.tip, veins: 0.3 });
  }
  for (let ring = 0; ring < 2; ring += 1) {
    for (let i = 0; i < rays; i += 1) {
      const az = ((i + ring * 0.5) / rays) * Math.PI * 2 + jitter(pr, 0.05);
      const pose = petalPose(head, az, lerp(0.12, 1.5 + jitter(pr, 0.12) + ring * 0.06, g.open), D * 0.94, -0.002 * ring);
      const len = range(pr, 0.085, 0.115) * g.head;
      b.sheet({
        ...pose,
        length: len,
        width: len * range(pr, 0.28, 0.36),
        cup: range(pr, 0.2, 0.5),
        curl: jitter(pr, 0.25),
        tipCurl: -range(pr, 0, 0.35),
        twist: jitter(pr, 0.5),
        ruffle: range(pr, 0.08, 0.18),
        ruffleFreq: 2,
        widthPos: 0.42,
        tipShape: 1.0,
        baseWidth: 0.2,
        base: vary(scaleRgb(paint.base, ring === 1 ? 0.85 : 1), pr, 0.05),
        tip: vary(paint.tip, pr, 0.05),
        accent: paint.accent,
        veins: paint.veins,
        blend: paint.blend,
        translucency: 0.7,
      });
    }
  }
  const disk = headFrame(madd(tip, axis, 0.008), axis, spin);
  b.blob({ material: MATERIAL.disk, center: disk.center, up: axis, front: head.b1, radii: [D, 0.008, D], base: linear("#2a1608"), tip: linear("#5a3311"), bumps: 0.6 });
  floretDisk(b, disk, D, 0.006, Math.round(lerp(150, 230, D / 0.09)), mixRgb(linear("#1c1006"), linear("#4a5a1a"), 1 - g.open), mixRgb(linear("#6a3e12"), linear("#6b7a2a"), 1 - g.open), 0.0028 * g.head + 0.0006, pr, linear("#c98e1c"));
  b.aura = { center: madd(tip, axis, 0.02), radius: (D + 0.1) * 2.1, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Snapdragon

const SNAPDRAGON: readonly Variant[] = [
  { name: "magenta", base: "#a3185a", tip: "#f06aa2", accent: "#7d1043", veins: 0.4 },
  { name: "peach", base: "#ec8a62", tip: "#ffd2b0", accent: "#c76a46", veins: 0.35 },
  { name: "yellow", base: "#e8b500", tip: "#fff07a", accent: "#c29000", veins: 0.3 },
  { name: "white", base: "#e9e5d9", tip: "#fbfaf4", accent: "#d8d0bc", veins: 0.3, weight: 0.6 },
  { name: "crimson", base: "#8a0c22", tip: "#d9283f", accent: "#650818", veins: 0.4 },
  { name: "rose-white", base: "#e05a8e", tip: "#fbe8ef", accent: "#b8406c", veins: 0.4, blend: 0.4 },
];

const snapdragon: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, SNAPDRAGON);
  const height = range(t, 0.68, 0.9);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#2f5520", tip: "#5f8030" });
  const stemColor = stemPaint(t, "#3f6024", "#62823a");
  const florets = int(t, 14, 19);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { widthPos: 0.4 });
  const g = b.growth;
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.05), 0, jitter(t, 0.04)], 0.025);
  b.stalkTube(s, 0.009, 0.005, stemColor);
  const lv = b.stream("leaves");
  const leafCount = int(lv, 6, 9);
  for (let i = 0; i < leafCount; i += 1) {
    const at = 0.06 + (i / leafCount) * 0.45;
    b.leaf(s.at(at), horizontal(spin + i * GOLDEN_ANGLE), range(lv, 0.45, 0.8), { length: range(lv, 0.065, 0.09) * (1 - at * 0.5), width: range(lv, 0.014, 0.019), widthPos: 0.4, tipShape: 1.2, curl: -0.4, cup: 0.45 }, leaf, jitter(lv, 0.3));
  }
  const fr = b.stream("florets");
  const throat = linear("#f4c22e");
  for (let i = 0; i < florets; i += 1) {
    const k = i / (florets - 1);
    const at = lerp(0.46, 0.985, k);
    const p = s.at(at);
    const tan = s.tangent(at);
    const az = spin + i * GOLDEN_ANGLE;
    const out = normalize(madd(horizontal(az), tan, -dot(horizontal(az), tan)));
    const openness = clamp(g.open * 1.7 - k * 1.05, 0, 1);
    const size = 1.6 * lerp(1, 0.55, k) * (0.5 + 0.5 * openness) * g.head;
    const q = add(madd(p, out, 0.01), [0, 0.003, 0]);
    b.segment(p, q, 0.002, 0.0018, stemColor);
    const axis = normalize(madd(out, UP, 0.35));
    if (openness < 0.18) {
      b.blob({ material: MATERIAL.petal, center: madd(q, axis, 0.01 * size), up: axis, front: perpendicularTo(axis), radii: [0.007 * size + 0.002, 0.013 * size + 0.003, 0.007 * size + 0.002], base: mixRgb(leaf.tip, paint.base, 0.4 + openness * 2), tip: mixRgb(leaf.tip, paint.tip, 0.5), translucency: 0.4 });
      continue;
    }
    const lipUp = normalize(madd(UP, axis, -dot(UP, axis)));
    const lipSide = cross(axis, lipUp);
    b.blob({ material: MATERIAL.petal, center: madd(q, axis, 0.017 * size), up: axis, front: lipUp, radii: [0.009 * size, 0.017 * size, 0.01 * size], base: paint.base, tip: paint.tip, translucency: 0.5 });
    const mouth = madd(q, axis, 0.03 * size);
    const lobe = (origin: Vec3, dirRaw: Vec3, len: number) => {
      const dir = normalize(dirRaw);
      const normal = normalize(madd(axis, dir, -dot(axis, dir)));
      b.sheet({
        origin,
        dir,
        normal,
        length: len,
        width: len * 0.95,
        cup: -0.35,
        curl: -0.2,
        tipCurl: -0.9 * openness,
        twist: jitter(fr, 0.2),
        ruffle: range(fr, 0.08, 0.16),
        ruffleFreq: 2,
        widthPos: 0.6,
        tipShape: 0.45,
        baseWidth: 0.3,
        base: vary(paint.base, fr, 0.04),
        tip: vary(paint.tip, fr, 0.04),
        accent: paint.accent,
        veins: paint.veins,
        blend: paint.blend,
        translucency: 0.65,
      });
    };
    for (const sgn of [-1, 1]) lobe(madd(mouth, lipUp, 0.006 * size), madd(madd(scale(axis, 0.45), lipUp, 0.9), lipSide, sgn * 0.42), 0.032 * size);
    for (const sgn of [-1, 0, 1]) lobe(madd(mouth, lipUp, -0.007 * size), madd(madd(scale(axis, 0.6), lipUp, -0.75), lipSide, sgn * 0.55), 0.028 * size);
    b.blob({ material: MATERIAL.petal, center: madd(madd(mouth, lipUp, -0.003 * size), axis, 0.003 * size), up: lipUp, front: axis, radii: [0.008 * size, 0.0055 * size, 0.007 * size], base: throat, tip: linear("#ffe27a"), translucency: 0.4 });
  }
  b.aura = { center: s.at(0.78), radius: height * 0.38, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Moonflower

const MOONFLOWER: readonly Variant[] = [
  { name: "white", base: "#e8efdc", tip: "#f9fbf6", accent: "#cfe3a6", veins: 0.85, weight: 3 },
  { name: "lilac", base: "#e4dcf0", tip: "#f6f2fb", accent: "#c9b8e6", veins: 0.8 },
  { name: "cream", base: "#f1e9cd", tip: "#fcf8ec", accent: "#e1d39a", veins: 0.8 },
];

function heartLeaf(b: PlantBuilder, at: Vec3, az: number, size: number, leaf: LeafColors, stemColor: { base: Rgb; tip: Rgb }, random: () => number) {
  const out = horizontal(az);
  const base = add(madd(at, out, 0.03 * size + 0.01), [0, 0.012, 0]);
  b.segment(at, base, 0.0025, 0.002, stemColor, MATERIAL.stem, [0, 0.006, 0]);
  b.leaf(base, out, range(random, 0.05, 0.35), { length: 0.1 * size, width: 0.09 * size, widthPos: 0.3, tipShape: 1.05, baseWidth: 0.12, curl: -0.6, cup: 0.3, ruffle: 0.05, veins: 0.55 }, leaf, jitter(random, 0.25));
}

const moonflower: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, MOONFLOWER);
  const height = range(t, 0.58, 0.8);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#2b5023", tip: "#5d8338" });
  const stemColor = stemPaint(t, "#456a2c", "#6e8f40");
  const spin = t() * Math.PI * 2;
  const secondBud = t() < 0.65;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { widthPos: 0.32 });
  const g = b.growth;
  const h = height * g.stalk;
  const sr = b.stream("stalk");
  const s = stalk([0, 0, 0], [jitter(sr, 0.14), h * 0.35, jitter(sr, 0.1)], [jitter(sr, 0.16), h * 0.75, jitter(sr, 0.1)], [jitter(sr, 0.06), h, 0.04]);
  b.stalkTube(s, 0.0065, 0.005, stemColor);
  const lv = b.stream("leaves");
  const leafCount = int(lv, 2, 4);
  for (let i = 0; i < leafCount; i += 1) heartLeaf(b, s.at(0.2 + i * 0.18), spin + i * 2.6, range(lv, 0.9, 1.15), leaf, stemColor, lv);
  const tip = s.at(1);
  const axis = normalize(madd(s.tangent(1), normalize([0, 0.55, 0.8]), 1.2));
  const size = range(t, 0.95, 1.12) * g.head;
  const tubeLen = 0.075 * size;
  const mouth = madd(tip, axis, tubeLen);
  b.segment(tip, mouth, 0.005, 0.014 * size, { base: linear("#b7cf98"), tip: paint.base, accent: paint.accent }, MATERIAL.filament);
  const head = headFrame(mouth, axis, spin);
  const pr = b.stream("petals");
  const open = g.open;
  for (let k = 0; k < 5; k += 1) {
    const az = (k / 5) * Math.PI * 2 + jitter(pr, 0.05);
    const pose = petalPose(head, az, lerp(0.06, 1.38 + jitter(pr, 0.06), open), lerp(0.002, 0.008, open) * size, -0.01 * size * (1 - open));
    b.sheet({
      ...pose,
      length: lerp(0.05, 0.066, open) * size,
      width: lerp(0.03, 0.092, open) * size,
      cup: lerp(1.2, 0.16, open),
      curl: lerp(0.3, -0.05, open),
      twist: lerp(2.0, 0, open),
      ruffle: range(pr, 0.08, 0.14),
      ruffleFreq: 2,
      widthPos: 0.8,
      tipShape: 0.3,
      notch: 0.03,
      baseWidth: 0.35,
      base: paint.base,
      tip: paint.tip,
      accent: paint.accent,
      veins: paint.veins,
      blend: 0.45,
      translucency: 0.85,
      glow: 0.32,
    });
  }
  for (let j = 0; j < 5; j += 1) {
    const r = radial(head, (j / 5) * Math.PI * 2 + 0.6);
    stamen(b, madd(mouth, axis, -0.012), madd(madd(mouth, axis, 0.012), r, 0.004), 0.0009, linear("#e7ecd6"), linear("#f3ecc4"), 0.0045);
  }
  if (secondBud) {
    const p = s.at(0.62);
    const out = horizontal(spin + 2.1);
    const budBase = add(madd(p, out, 0.05), [0, 0.04, 0]);
    b.segment(p, budBase, 0.003, 0.0025, stemColor, MATERIAL.stem, [0, 0.02, 0]);
    const budAxis = normalize(madd(out, UP, 1.4));
    const bud = headFrame(budBase, budAxis, spin);
    for (let k = 0; k < 5; k += 1) {
      const pose = petalPose(bud, (k / 5) * Math.PI * 2, 0.05, 0.002);
      b.sheet({ ...pose, length: 0.055 * g.head, width: 0.022, cup: 1.2, curl: 0.2, twist: 2.3, widthPos: 0.7, tipShape: 0.8, base: linear("#b8cf98"), tip: paint.base, accent: paint.accent, veins: 0.5, translucency: 0.7, glow: 0.2 });
    }
  }
  b.aura = { center: madd(mouth, axis, 0.01), radius: 0.2 * size, color: mixRgb(paint.tip, linear("#cfe0ff"), 0.3) };
};

// ---------------------------------------------------------------------------
// Bluebell

const BLUEBELL: readonly Variant[] = [
  { name: "violet-blue", base: "#2f3792", tip: "#6670d4", accent: "#1f2570", veins: 0.45, weight: 4 },
  { name: "lavender", base: "#6a5aa8", tip: "#a99be0", accent: "#4e3f8a", veins: 0.4 },
  { name: "pink", base: "#b45a92", tip: "#efa7cf", accent: "#8f3e70", veins: 0.4, weight: 0.6 },
  { name: "white", base: "#d9dde8", tip: "#f6f7fb", accent: "#b7bccf", veins: 0.35, weight: 0.4 },
];

const bluebell: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, BLUEBELL);
  const height = range(t, 0.38, 0.5);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#2a5222", tip: "#5f8a3a" });
  const stemColor = stemPaint(t, "#3f6228", "#58702e");
  const bells = int(t, 5, 9);
  const spin = t() * Math.PI * 2;
  const arch = range(t, 0.12, 0.19);
  if (b.growth.stage === "seedling") return seedling(b, leaf, "strap");
  const g = b.growth;
  const lv = b.stream("leaves");
  const leafCount = int(lv, 4, 6);
  for (let i = 0; i < leafCount; i += 1) {
    b.leaf([0, 0.004, 0], horizontal(spin + (i / leafCount) * Math.PI * 2 + jitter(lv, 0.4)), range(lv, 0.9, 1.25), { length: range(lv, 0.2, 0.3) * lerp(0.7, 1, g.stalk), width: range(lv, 0.018, 0.025), widthPos: 0.3, tipShape: 1.3, curl: -range(lv, 0.9, 1.5), cup: 0.7, baseWidth: 0.5, veins: 0.3 }, leaf, jitter(lv, 0.3));
  }
  const h = height * g.stalk;
  // Arches over toward the viewer's right, with the bells hanging toward the viewer.
  const archDir = horizontal(-0.35 + jitter(t, 0.4));
  const s = stalk([0, 0, 0], [0, h * 0.55, 0], scale(add(scale(archDir, arch * 0.45 * g.stalk), [0, h * 1.08 / 1, 0]), 1), add(scale(archDir, arch * g.stalk), [0, h * 0.86, 0]));
  b.stalkTube(s, 0.0055, 0.0035, stemColor);
  const fr = b.stream("bells");
  const front = normalize(cross(archDir, UP));
  const facing = dot(front, [0, 0, 1]) >= 0 ? front : scale(front, -1);
  for (let i = 0; i < bells; i += 1) {
    const k = i / (bells - 1);
    const at = lerp(0.48, 0.99, k);
    const p = s.at(at);
    const openness = clamp(g.open * 1.5 - k * 0.85, 0, 1);
    const size = lerp(1, 0.6, k) * (0.55 + 0.45 * openness) * g.head;
    const sideways = normalize(madd(facing, archDir, jitter(fr, 0.5)));
    const q = add(madd(p, sideways, 0.016), [0, -0.004, 0]);
    b.segment(p, q, 0.0018, 0.0015, stemColor, MATERIAL.stem, [0, 0.006, 0]);
    const axis = normalize(add(scale(sideways, range(fr, 0.25, 0.45)), [0, -1, 0]));
    const bell = headFrame(q, axis, fr() * Math.PI * 2);
    for (let j = 0; j < 6; j += 1) {
      const pose = petalPose(bell, (j / 6) * Math.PI * 2 + jitter(fr, 0.08), lerp(0.04, 0.17, openness), 0.003);
      b.sheet({
        ...pose,
        length: 0.046 * size,
        width: 0.022 * size,
        cup: 1.35,
        curl: 0.05,
        tipCurl: -lerp(0.1, 2.0, openness),
        twist: jitter(fr, 0.15),
        ruffle: 0.04,
        ruffleFreq: 1.5,
        widthPos: 0.52,
        tipShape: 0.75,
        baseWidth: 0.4,
        base: vary(paint.base, fr, 0.05),
        tip: vary(paint.tip, fr, 0.05),
        accent: paint.accent,
        veins: paint.veins,
        blend: 0.55,
        translucency: 0.78,
      });
    }
    if (openness > 0.3) {
      for (let j = 0; j < 3; j += 1) {
        const r = radial(bell, (j / 3) * Math.PI * 2);
        stamen(b, madd(q, axis, 0.006), madd(madd(q, axis, 0.03 * size), r, 0.003), 0.0007, linear("#e8e2f0"), linear("#e8d9a0"), 0.0035);
      }
    }
  }
  b.aura = { center: s.at(0.75), radius: height * 0.42, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Dandelion

const dandelion: Builder = (b, options) => {
  const t = b.stream("traits");
  const height = range(t, 0.28, 0.42);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#2f5a1d", tip: "#6a8f34", accent: "#c7d39a" });
  const scapeColor = { base: vary(linear("#7a5a35"), t, 0.1), tip: vary(linear("#a2b35e"), t, 0.1), accent: linear("#c7d39a") };
  const ligulesPerRing = int(t, 22, 28);
  const spin = t() * Math.PI * 2;
  const golden = vary(linear("#f2b300"), t, 0.05);
  const orange = vary(linear("#e48800"), t, 0.05);
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { teeth: 3, toothDepth: 0.45, widthPos: 0.6 });
  const g = b.growth;
  const lv = b.stream("leaves");
  const rosette = int(lv, 5, 8);
  for (let i = 0; i < rosette; i += 1) {
    b.leaf([0, 0.003, 0], horizontal(spin + (i / rosette) * Math.PI * 2 + jitter(lv, 0.3)), range(lv, 0.12, 0.35), {
      length: range(lv, 0.15, 0.21) * lerp(0.7, 1, g.stalk),
      width: range(lv, 0.042, 0.052),
      widthPos: 0.62,
      tipShape: 0.85,
      teeth: int(lv, 4, 6),
      toothDepth: range(lv, 0.45, 0.6),
      curl: -0.25,
      cup: 0.25,
      baseWidth: 0.05,
      veins: 0.6,
    }, leaf, jitter(lv, 0.3));
  }
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.05), 0, jitter(t, 0.04) + 0.02], 0.03);
  b.stalkTube(s, 0.0058, 0.005, scapeColor);
  const tip = s.at(1);
  const puff = options.puff && g.stage === "bloom";
  const head = headFrame(tip, faceViewer(s.tangent(1), puff ? 0 : 0.4), spin);
  const pr = b.stream("petals");
  // Bracts: outer ones fold back as the head opens.
  for (let k = 0; k < 12; k += 1) {
    const pose = petalPose(head, (k / 12) * Math.PI * 2 + jitter(pr, 0.15), lerp(0.25, puff ? 2.6 : 2.2, g.open), 0.006, -0.006);
    b.sheet({ material: MATERIAL.leaf, ...pose, length: 0.024, width: 0.0055, tipShape: 1.4, widthPos: 0.35, curl: -0.6 * g.open, base: leaf.base, tip: leaf.tip, veins: 0.2 });
  }
  if (puff) {
    const R = range(t, 0.055, 0.065);
    const sr = b.stream("seeds");
    const seeds = int(sr, 70, 95);
    const pappus = linear("#f6f4ec");
    b.blob({ material: MATERIAL.disk, center: tip, up: head.axis, front: head.b1, radii: [0.007, 0.006, 0.007], base: linear("#8a7a4a"), tip: linear("#c9b98a"), bumps: 0.8 });
    for (let i = 0; i < seeds; i += 1) {
      const yy = 1 - ((i + 0.5) / seeds) * 1.75;
      const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
      const az = i * GOLDEN_ANGLE;
      const d = normalize(madd(madd(scale(head.axis, yy), head.b1, rr * Math.cos(az)), head.b2, rr * Math.sin(az)));
      const reach = R * range(sr, 0.9, 1.04);
      b.blob({ material: MATERIAL.disk, center: madd(tip, d, 0.009), up: d, front: perpendicularTo(d), radii: [0.0012, 0.0032, 0.0012], base: linear("#6a5434"), tip: linear("#9a8058") });
      b.segment(madd(tip, d, 0.012), madd(tip, d, reach), 0.0005, 0.0004, { base: linear("#e8e2d0"), tip: pappus }, MATERIAL.filament);
      b.blob({ material: MATERIAL.pappus, center: madd(tip, d, reach), up: d, front: perpendicularTo(d), radii: [0.013, 0.0045, 0.013], base: pappus, tip: linear("#ffffff"), translucency: 0.9, glow: 0.12 });
    }
    b.aura = { center: tip, radius: R * 2.6, color: linear("#f3efe2") };
    return;
  }
  const R = range(t, 0.045, 0.055) * g.head;
  const rings = 5;
  for (let ring = 0; ring < rings; ring += 1) {
    const k = ring / (rings - 1);
    const count = Math.round(ligulesPerRing * lerp(1, 0.45, k));
    for (let j = 0; j < count; j += 1) {
      const az = (j / count) * Math.PI * 2 + ring * 0.37 + jitter(pr, 0.08);
      const pose = petalPose(head, az, lerp(0.06, lerp(1.5, 0.4, k) + jitter(pr, 0.1), g.open), R * 0.12 * (1 - k), R * 0.16 * k * g.open);
      const len = R * lerp(0.98, 0.42, k) * range(pr, 0.9, 1.08) * lerp(0.55, 1, g.open);
      b.sheet({
        ...pose,
        length: len,
        width: 0.0078 * lerp(1, 0.75, k) * g.head,
        cup: 0.35,
        curl: lerp(-0.05, 0.5, k),
        twist: jitter(pr, 0.35),
        ruffle: 0.04,
        ruffleFreq: 2,
        widthPos: 0.72,
        tipShape: 0.4,
        notch: 0.06,
        teeth: 2,
        toothDepth: 0.2,
        baseWidth: 0.25,
        base: mixRgb(golden, orange, k * 0.8),
        tip: vary(mixRgb(linear("#ffd534"), orange, k * 0.5), pr, 0.05),
        accent: orange,
        veins: 0.35,
        translucency: 0.65,
      });
    }
  }
  b.aura = { center: madd(tip, head.axis, 0.01), radius: R * 2.8, color: golden };
};

// ---------------------------------------------------------------------------
// Forget-me-not

const FORGET_ME_NOT: readonly Variant[] = [
  { name: "sky", base: "#f5e3a0", tip: "#5d9de2", accent: "#3c78c0", veins: 0.3, blend: 0.2, weight: 4 },
  { name: "pink", base: "#f6e7b0", tip: "#e997bf", accent: "#c56f99", veins: 0.3, blend: 0.2 },
  { name: "white", base: "#f6e9b8", tip: "#f4f5f8", accent: "#d0d4de", veins: 0.25, blend: 0.2, weight: 0.5 },
];

const forgetMeNot: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, FORGET_ME_NOT);
  const height = range(t, 0.24, 0.34);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#335a24", tip: "#6a8d3e" });
  const stemColor = stemPaint(t, "#4a6a2c", "#6f8a3e");
  const stems = int(t, 3, 4);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { widthPos: 0.55 });
  const g = b.growth;
  const fr = b.stream("flowers");
  const lv = b.stream("leaves");
  const bud = linear("#e3a2c8");
  const eye = linear("#f2c94c");
  let auraSum: Vec3 = [0, 0, 0];
  for (let i = 0; i < stems; i += 1) {
    const az = spin + (i / stems) * Math.PI * 2 + jitter(fr, 0.4);
    const out = horizontal(az);
    const h = height * g.stalk * range(fr, 0.8, 1.05);
    const spread = range(fr, 0.03, 0.08);
    const s = stalk([0, 0, 0], madd([0, h * 0.4, 0], out, spread * 0.3), madd([0, h * 0.8, 0], out, spread * 0.8), madd([0, h, 0.01], out, spread));
    b.stalkTube(s, 0.0035, 0.0025, stemColor);
    for (let k = 0; k < 3; k += 1) {
      const at = 0.15 + k * 0.22;
      b.leaf(s.at(at), horizontal(az + (k % 2 ? 1.6 : -1.6) + jitter(lv, 0.3)), range(lv, 0.4, 0.7), { length: range(lv, 0.035, 0.05), width: range(lv, 0.011, 0.014), widthPos: 0.5, tipShape: 0.75, curl: -0.3, cup: 0.3, veins: 0.3 }, leaf, jitter(lv, 0.3));
    }
    const top = s.at(1);
    auraSum = add(auraSum, top);
    const count = int(fr, 7, 12);
    for (let j = 0; j < count; j += 1) {
      const k = j / (count - 1);
      const openness = clamp(g.open * 1.6 - k * 0.9, 0, 1);
      const ring = 0.02 * (1 - k * 0.65);
      const place: Vec3 = add(top, [Math.cos(az + j * 1.9) * ring, 0.004 + k * 0.012, Math.sin(az + j * 1.9) * ring]);
      b.segment(top, place, 0.0012, 0.001, stemColor);
      if (openness < 0.2) {
        b.blob({ material: MATERIAL.petal, center: place, up: UP, front: [0, 0, 1], radii: [0.003, 0.0038, 0.003], base: mixRgb(bud, paint.tip, openness * 3), tip: bud, translucency: 0.5 });
        continue;
      }
      const axis = normalize(add(normalize([place[0] - top[0], 0, place[2] - top[2] + 0.004]), [0, 1.4, 0.5]));
      const flower = headFrame(place, axis, fr() * Math.PI * 2);
      const size = lerp(0.7, 1, openness) * range(fr, 0.9, 1.1);
      for (let p = 0; p < 5; p += 1) {
        const pose = petalPose(flower, (p / 5) * Math.PI * 2, lerp(0.3, 1.5, openness), 0.0012);
        b.sheet({ ...pose, length: 0.0115 * size, width: 0.0125 * size, cup: 0.15, curl: -0.1, widthPos: 0.64, tipShape: 0.42, baseWidth: 0.3, ruffle: 0.05, base: paint.base, tip: vary(paint.tip, fr, 0.05), accent: paint.accent, veins: paint.veins, blend: paint.blend, translucency: 0.65 });
      }
      b.blob({ material: MATERIAL.anther, center: madd(place, axis, 0.001), up: axis, front: flower.b1, radii: [0.0022, 0.0016, 0.0022], base: eye, tip: linear("#fff2b0"), bumps: 0.5 });
    }
  }
  b.aura = { center: scale(auraSum, 1 / stems), radius: 0.12, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Peony

const PEONY: readonly Variant[] = [
  { name: "blush", base: "#d97f96", tip: "#fbdce3", accent: "#c26a82", veins: 0.35 },
  { name: "coral", base: "#e0574a", tip: "#fcb59e", accent: "#b84034", veins: 0.4 },
  { name: "magenta", base: "#9b1857", tip: "#e870a5", accent: "#7a1043", veins: 0.4 },
  { name: "cream", base: "#ead5bd", tip: "#fffaf3", accent: "#d8bfa4", veins: 0.3 },
  { name: "deep-red", base: "#5a0a1f", tip: "#bf2945", accent: "#40061a", veins: 0.4 },
];

const peony: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, PEONY);
  const height = range(t, 0.55, 0.7);
  const leaf = leafColors(b.stream("leaf-colors"), { base: "#284a20", tip: "#5a7a32", accent: "#9a7a5a" });
  const stemColor = stemPaint(t, "#4f4a2a", "#5f7230");
  const semiDouble = t() < 0.35;
  const innerCount = semiDouble ? int(t, 16, 22) : int(t, 34, 46);
  const guardCount = int(t, 7, 10);
  const spin = t() * Math.PI * 2;
  if (b.growth.stage === "seedling") return seedling(b, leaf, "dicot", { widthPos: 0.4 });
  const g = b.growth;
  const s = bowedStalk(b.stream("stalk"), height * g.stalk, [jitter(t, 0.06), 0, jitter(t, 0.05) + 0.02], 0.04);
  b.stalkTube(s, 0.012, 0.009, stemColor);
  const lv = b.stream("leaves");
  for (let i = 0; i < 3; i += 1) {
    const p = s.at(0.2 + i * 0.2);
    const az = spin + i * 2.3 + jitter(lv, 0.3);
    const out = horizontal(az);
    const end = add(madd(p, out, 0.06), [0, 0.02, 0]);
    b.segment(p, end, 0.003, 0.0025, stemColor);
    for (const turn of [-0.9, 0, 0.9]) {
      b.leaf(end, horizontal(az + turn), range(lv, 0.05, 0.3), { length: range(lv, 0.07, 0.095), width: range(lv, 0.022, 0.03), widthPos: 0.45, tipShape: 1.15, curl: -0.5, cup: 0.35, ruffle: 0.05, veins: 0.55 }, leaf, jitter(lv, 0.3));
    }
  }
  const tip = s.at(1);
  const head = headFrame(tip, faceViewer(s.tangent(1), 0.3), spin);
  const R = range(t, 0.115, 0.14) * g.head;
  const pr = b.stream("petals");
  for (let k = 0; k < 5; k += 1) {
    const pose = petalPose(head, (k / 5) * Math.PI * 2, lerp(0.4, 1.9, g.open), 0.008, -0.004);
    b.sheet({ material: MATERIAL.leaf, ...pose, length: 0.03, width: 0.022, tipShape: 0.7, widthPos: 0.5, cup: 0.8, curl: -0.3 * g.open, base: leaf.base, tip: leaf.tip, veins: 0.3 });
  }
  // A firm round bud that loosens into petals.
  const core = R * 0.42 * (1 - g.open * 0.75);
  b.blob({ material: MATERIAL.petal, center: madd(tip, head.axis, core * 0.85), up: head.axis, front: head.b1, radii: [core, core * 0.95, core], base: paint.base, tip: paint.tip, translucency: 0.4, bumps: 0.2 });
  for (let i = 0; i < guardCount; i += 1) {
    const az = (i / guardCount) * Math.PI * 2 + jitter(pr, 0.2);
    const pose = petalPose(head, az, lerp(0.18, 1.12 + jitter(pr, 0.15), g.open), R * 0.08, 0);
    b.sheet({
      ...pose,
      length: R * range(pr, 0.9, 1.05),
      width: R * range(pr, 0.95, 1.15),
      cup: 0.9,
      curl: 0.5,
      tipCurl: -0.3 * g.open,
      twist: jitter(pr, 0.2),
      ruffle: range(pr, 0.18, 0.28),
      ruffleFreq: range(pr, 2.5, 3.5),
      widthPos: 0.62,
      tipShape: 0.45,
      notch: pr() < 0.3 ? range(pr, 0.02, 0.04) : 0,
      baseWidth: 0.25,
      base: vary(paint.base, pr, 0.05),
      tip: vary(paint.tip, pr, 0.05),
      accent: paint.accent,
      veins: paint.veins,
      blend: 0.5,
      translucency: 0.6,
    });
  }
  for (let i = 0; i < innerCount; i += 1) {
    const k = i / innerCount;
    const az = i * GOLDEN_ANGLE + jitter(pr, 0.3);
    const elevation = lerp(0.12, lerp(0.95, 0.22, k) + jitter(pr, 0.15), g.open);
    const pose = petalPose(head, az, elevation, R * 0.22 * (1 - k) * g.open, R * 0.12 * g.open);
    const len = R * lerp(0.82, 0.45, k) * range(pr, 0.9, 1.1);
    const shade = semiDouble ? 1 : lerp(1, 0.82, k);
    b.sheet({
      ...pose,
      length: len,
      width: len * lerp(1.15, 0.95, k),
      cup: 1.2,
      curl: range(pr, 0.5, 1.0),
      tipCurl: jitter(pr, 0.3),
      twist: jitter(pr, 0.3),
      ruffle: range(pr, 0.12, 0.24),
      ruffleFreq: range(pr, 2.5, 3.5),
      widthPos: 0.64,
      tipShape: 0.35,
      notch: pr() < 0.2 ? range(pr, 0.03, 0.06) : 0,
      baseWidth: 0.25,
      base: vary(scaleRgb(paint.base, shade), pr, 0.06),
      tip: vary(scaleRgb(paint.tip, lerp(1, 0.94, k)), pr, 0.05),
      accent: paint.accent,
      veins: paint.veins,
      blend: 0.55,
      translucency: 0.6,
    });
  }
  if (semiDouble && g.open > 0.3) {
    const gold = linear("#e8b21e");
    const sr = b.stream("stamens");
    for (let j = 0; j < 26; j += 1) {
      const r = radial(head, j * GOLDEN_ANGLE);
      const rr = range(sr, 0.008, 0.022);
      stamen(b, madd(madd(tip, r, rr * 0.4), head.axis, 0.012), madd(madd(tip, r, rr), head.axis, range(sr, 0.03, 0.042)), 0.0009, linear("#f0d68a"), gold, 0.0045);
    }
  }
  b.aura = { center: madd(tip, head.axis, R * 0.35), radius: R * 2.5, color: paint.tip };
};

// ---------------------------------------------------------------------------
// Cactus

const CACTUS_BLOOM: readonly Variant[] = [
  { name: "magenta", base: "#b8135f", tip: "#ff7ab2", accent: "#8a0c45", veins: 0.4 },
  { name: "sun", base: "#e09a00", tip: "#ffe066", accent: "#b87a00", veins: 0.35 },
  { name: "ember", base: "#c8300f", tip: "#ff9c4a", accent: "#9a220a", veins: 0.4 },
  { name: "snow", base: "#e6dccb", tip: "#fffaf2", accent: "#cbbfa8", veins: 0.3, weight: 0.5 },
];

const cactus: Builder = (b) => {
  const t = b.stream("traits");
  const paint = pickVariant(t, CACTUS_BLOOM);
  const roll = t();
  const form = roll < 0.55 ? "column" : roll < 0.82 ? "barrel" : "branched";
  const ribs = form === "barrel" ? int(t, 14, 20) : int(t, 9, 13);
  const height = form === "barrel" ? range(t, 0.2, 0.26) : range(t, 0.36, 0.5);
  const body = vary(linear(form === "barrel" ? "#41703f" : "#3b6a3a"), t, 0.1);
  const ridge = vary(linear("#78a25e"), t, 0.08);
  const wool = linear("#efe8d8");
  const spine = { base: vary(linear("#efe2bf"), t, 0.05), tip: vary(linear("#8a6638"), t, 0.08) };
  const spin = t() * Math.PI * 2;
  const g = b.growth;
  const growth = 0.3 + 0.7 * smoothstep(0, 0.85, g.fraction);
  const up = UP;
  const front: Vec3 = [Math.cos(spin), 0, Math.sin(spin)];
  const columns: { center: Vec3; up: Vec3; front: Vec3; radii: Vec3; squareness: number }[] = [];
  if (form === "barrel") {
    const r = 0.11 * growth;
    columns.push({ center: [0, r * 0.85, 0], up, front, radii: [r, r * 0.95, r], squareness: 0.85 });
  } else {
    const rx = (form === "branched" ? 0.065 : 0.072) * (0.55 + 0.45 * growth);
    const ry = height * 0.5 * growth;
    columns.push({ center: [0, ry * 0.94, 0], up, front, radii: [rx, ry, rx], squareness: 0.55 });
    if (form === "branched" && g.fraction >= 0.25) {
      const arms = 1 + (t() < 0.5 ? 1 : 0);
      for (let a = 0; a < arms; a += 1) {
        const side = horizontal(spin + Math.PI / 2 + a * Math.PI + jitter(t, 0.3));
        const armGrow = smoothstep(0.25, 0.9, g.fraction);
        const elbow = add(madd([0, ry * range(t, 0.7, 1.0), 0], side, rx * 0.8), [0, 0, 0]);
        const armR = rx * 0.62;
        const armH = ry * range(t, 0.35, 0.5) * armGrow + 0.01;
        const reach = madd(elbow, side, rx * 0.9 * armGrow + 0.01);
        b.segment(elbow, reach, armR, armR, { base: body, tip: body, accent: ridge }, MATERIAL.cactus, [0, -0.01, 0]);
        columns.push({ center: add(reach, [0, armH * 0.9, 0]), up, front, radii: [armR, armH, armR], squareness: 0.6 });
      }
    }
  }
  const sp = b.stream("spines");
  let crown: Vec3 = [0, 0, 0];
  columns.forEach((col, index) => {
    const ribDepth = form === "barrel" ? 0.13 : 0.18;
    b.blob({ material: MATERIAL.cactus, center: col.center, up: col.up, front: col.front, radii: col.radii, ribs, ribDepth, squareness: col.squareness, base: body, tip: ridge, accent: wool, veins: 0.5, translucency: 0.15 });
    if (index === 0) crown = add(col.center, [0, col.radii[1] * 0.98, 0]);
    const areoles = Math.max(3, Math.round((col.radii[1] / 0.04) * (form === "barrel" ? 1.6 : 1.1)));
    for (let rib = 0; rib < ribs; rib += 1) {
      const phi = (rib / ribs) * Math.PI * 2;
      for (let a = 0; a < areoles; a += 1) {
        const theta = lerp(0.18, form === "barrel" ? 1.95 : 2.55, (a + (rib % 2) * 0.5) / areoles);
        const surface = blobSurface(col.center, col.up, col.front, col.radii, ribs, ribDepth, col.squareness, theta, phi);
        if (surface.point[1] < 0.015) continue;
        b.blob({ material: MATERIAL.anther, center: surface.point, up: surface.outward, front: perpendicularTo(surface.outward), radii: [0.0022, 0.0016, 0.0022], base: wool, tip: wool, bumps: 0.8 });
        const count = form === "barrel" ? 3 : 2 + (sp() < 0.5 ? 1 : 0);
        for (let k = 0; k < count; k += 1) {
          const dir = normalize(add(surface.outward, [jitter(sp, 0.6), jitter(sp, 0.6) + (k === 0 ? 0.1 : -0.15), jitter(sp, 0.6)]));
          const len = range(sp, 0.012, form === "barrel" ? 0.03 : 0.022) * (0.6 + 0.4 * growth);
          b.segment(surface.point, madd(surface.point, dir, len), 0.0011, 0.00015, spine, MATERIAL.spine);
        }
      }
    }
  });
  if (g.fraction >= 0.25) {
    const flowers = 1 + (form === "barrel" && t() < 0.5 ? 1 : 0);
    const pr = b.stream("petals");
    for (let f = 0; f < flowers; f += 1) {
      const off = f === 0 ? [0, 0, 0] : [0.04, -0.012, 0.02];
      const base = add(crown, off as Vec3);
      const axis = normalize(add([off[0] * 3, 1, off[2] * 3 + 0.25], [0, 0, 0]));
      const size = g.head * range(pr, 0.9, 1.1);
      b.blob({ material: MATERIAL.leaf, center: madd(base, axis, 0.008 * size), up: axis, front: perpendicularTo(axis), radii: [0.011 * size, 0.016 * size, 0.011 * size], base: mixRgb(body, paint.base, 0.3), tip: ridge, bumps: 0.5 });
      const head = headFrame(madd(base, axis, 0.018 * size), axis, pr() * 6.28);
      for (let ring = 0; ring < 2; ring += 1) {
        const count = int(pr, 9, 12);
        for (let i = 0; i < count; i += 1) {
          const pose = petalPose(head, ((i + ring * 0.5) / count) * Math.PI * 2 + jitter(pr, 0.08), lerp(0.06, ring === 0 ? 1.0 : 0.6, g.open) + jitter(pr, 0.08), 0.004);
          b.sheet({
            ...pose,
            length: (ring === 0 ? 0.046 : 0.04) * size,
            width: 0.0145 * size,
            cup: 0.6,
            curl: ring === 0 ? -0.25 : 0.1,
            twist: jitter(pr, 0.2),
            ruffle: 0.04,
            widthPos: 0.55,
            tipShape: 1.05,
            baseWidth: 0.3,
            base: vary(ring === 0 ? mixRgb(paint.base, body, 0.25) : paint.base, pr, 0.05),
            tip: vary(paint.tip, pr, 0.05),
            accent: paint.accent,
            veins: paint.veins,
            blend: 0.5,
            translucency: 0.7,
          });
        }
      }
      if (g.open > 0.4) {
        for (let j = 0; j < 10; j += 1) {
          const r = radial(head, j * GOLDEN_ANGLE);
          stamen(b, madd(head.center, r, 0.002), madd(madd(head.center, head.axis, 0.016 * size), r, 0.006), 0.0007, linear("#f7e7a8"), linear("#f2c230"), 0.003);
        }
      }
    }
    b.aura = { center: madd(crown, [0, 1, 0], 0.03), radius: 0.12, color: paint.tip };
  } else {
    b.aura = null;
  }
};

export const SPECIES: Record<FlowerType, Builder> = {
  rose,
  cactus,
  tulip,
  marigold,
  daisy,
  hydrangea,
  sunflower,
  snapdragon,
  moonflower,
  bluebell,
  dandelion,
  "forget-me-not": forgetMeNot,
  peony,
};

