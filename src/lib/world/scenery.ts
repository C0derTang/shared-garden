/**
 * Deterministic procedural composition of the lakeside garden: leaf-card
 * trees on both shores, reeds at the waterline, and a meadow of grass blades
 * and wildflowers around the planting beds. Everything is expressed with the
 * shared stroke primitive (oriented, brush-masked cards). Pure data, no GPU
 * calls, so it can be unit tested.
 */

import { hexToLinear } from "./sky-palette";
import {
  BED_RADIUS,
  CAMERA_HOME,
  WATER_LEVEL,
  bedAt,
  distanceToBeds,
  shorelineZ,
  terrainHeight,
  type Vec3,
} from "./layout";
import { STROKE_KIND, createRandom, jitterColor, type Stroke } from "./strokes";

const WORLD_SEED = 0x6a7d2026;

const palette = (hexes: readonly string[]) => hexes.map((hex) => hexToLinear(hex) as Vec3);

const BLADES = palette(["#5b7d34", "#6f8f3c", "#8aa457", "#4f6e2e", "#a7b866", "#c2c46e", "#3f5f2a"]);
const SOIL = palette(["#5b3a24", "#6e4a2c", "#7d5634", "#4a2f1f", "#8a6440"]);
const FOLIAGE = palette(["#35592a", "#43692f", "#557a37", "#628a3f", "#2c4a26", "#6f9446"]);
const PINE = palette(["#2a4a34", "#315440", "#3b6148", "#24402e", "#436a52"]);
const BARK = palette(["#3a2a20", "#4a3526", "#2d221b", "#56402c"]);
const REEDS = palette(["#6b7a3a", "#7f8a45", "#9a9250", "#5b6a33", "#a8975a"]);
const GOLDEN_TIPS = palette(["#b9b062", "#c9b56a", "#a9a45a"]);
const WILDFLOWERS = palette(["#f2a7b8", "#f6f0e4", "#f3cf5c", "#b9a6e8", "#ee8a6d", "#f7d9e3"]);

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Slow, smooth pseudo-noise for patches and flow (no allocation). */
export function field(x: number, z: number, salt: number): number {
  return (
    0.5 +
    0.25 * Math.sin(x * 0.21 + salt * 1.7 + Math.sin(z * 0.13 + salt)) +
    0.17 * Math.sin(z * 0.29 - x * 0.11 + salt * 2.9) +
    0.08 * Math.sin(x * 0.67 + z * 0.53 + salt * 5.1)
  );
}

interface TreeOptions {
  readonly x: number;
  readonly z: number;
  readonly size: number;
  /** Stroke size multiplier (bigger, looser strokes far away). */
  readonly brush: number;
  readonly density: number;
}

function deciduousTree(strokes: Stroke[], random: () => number, tree: TreeOptions): void {
  const ground = terrainHeight(tree.x, tree.z);
  const trunkHeight = (1.6 + random() * 1.6) * tree.size;
  const rx = (1.6 + random() * 1.2) * tree.size;
  const ry = (1.8 + random() * 1.3) * tree.size;
  const rz = rx * 0.85;
  const center: Vec3 = [tree.x, ground + trunkHeight + ry * 0.7, tree.z];
  const leafTint = jitterColor([1, 1, 1], random, 0.12);

  for (let i = 0; i < 4; i += 1) {
    strokes.push({
      kind: STROKE_KIND.trunk,
      origin: [tree.x + (random() - 0.5) * 0.25 * tree.size, ground - 0.05, tree.z + 0.1],
      axis: [(random() - 0.5) * 0.25, trunkHeight + ry * 0.4, 0],
      width: (0.16 + random() * 0.12) * tree.size,
      bend: (random() - 0.5) * 0.2,
      seed: random(),
      normal: [0, 0, 1],
      color: jitterColor(pick(BARK, random), random, 0.1),
      extra: 0.5,
    });
  }

  const count = Math.round(170 * tree.size * tree.size * tree.density);
  for (let i = 0; i < count; i += 1) {
    // Uniform direction, biased to the side facing the camera (+z).
    const u = random() * 2 - 1;
    const phi = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    let dir: Vec3 = [s * Math.cos(phi), u, s * Math.sin(phi)];
    if (dir[2] < -0.2 && random() < 0.75) dir = [dir[0], dir[1], -dir[2]];
    const depth = 0.72 + random() * 0.3;
    // (depth also shades the leaf below.)
    const point: Vec3 = [center[0] + dir[0] * rx * depth, center[1] + dir[1] * ry * depth, center[2] + dir[2] * rz * depth];
    const normal = normalize([dir[0] / rx, dir[1] / ry, dir[2] / rz]);
    // Leaves droop: tangent toward gravity, swung randomly about the normal.
    const d = -normal[1];
    let tangent = normalize([-normal[0] * d, -1 - normal[1] * d, -normal[2] * d]);
    const side = normalize(cross(normal, tangent));
    const swing = (random() - 0.5) * 1.6;
    tangent = normalize([
      tangent[0] * Math.cos(swing) + side[0] * Math.sin(swing),
      tangent[1] * Math.cos(swing) + side[1] * Math.sin(swing),
      tangent[2] * Math.cos(swing) + side[2] * Math.sin(swing),
    ]);
    const base = pick(FOLIAGE, random);
    strokes.push({
      kind: STROKE_KIND.foliage,
      origin: point,
      axis: scale(tangent, (0.45 + random() * 0.4) * tree.brush * tree.size),
      width: (0.24 + random() * 0.16) * tree.brush * tree.size,
      bend: (random() - 0.5) * 0.6,
      seed: random(),
      normal,
      // Leaves deep inside the crown sit in shadow.
      color: jitterColor(scale([base[0] * leafTint[0], base[1] * leafTint[1], base[2] * leafTint[2]], 0.45 + 0.6 * (depth - 0.72) / 0.3), random, 0.15),
      extra: 0.15 + random() * 0.2,
    });
  }
}

function conifer(strokes: Stroke[], random: () => number, tree: TreeOptions): void {
  const ground = terrainHeight(tree.x, tree.z);
  const height = (5 + random() * 3.5) * tree.size;
  const radius = (1.3 + random() * 0.8) * tree.size;
  const baseY = ground + 0.6 * tree.size;
  strokes.push({
    kind: STROKE_KIND.trunk,
    origin: [tree.x, ground - 0.05, tree.z],
    axis: [0, height * 0.5, 0],
    width: 0.2 * tree.size,
    bend: 0,
    seed: random(),
    normal: [0, 0, 1],
    color: pick(BARK, random),
    extra: 0.5,
  });
  const count = Math.round(150 * tree.size * tree.size * tree.density);
  for (let i = 0; i < count; i += 1) {
    const t = Math.pow(random(), 0.8);
    const r = radius * (1 - t) * (0.75 + random() * 0.35);
    let angle = random() * Math.PI * 2;
    if (Math.sin(angle) < -0.3 && random() < 0.75) angle = -angle;
    const out: Vec3 = [Math.cos(angle), 0, Math.sin(angle)];
    strokes.push({
      kind: STROKE_KIND.foliage,
      origin: [tree.x + out[0] * r, baseY + t * height, tree.z + out[2] * r],
      axis: scale(normalize([out[0] * 0.7, -0.45 - random() * 0.2, out[2] * 0.7]), (0.4 + random() * 0.35) * tree.brush * tree.size),
      width: (0.2 + random() * 0.12) * tree.brush * tree.size,
      bend: (random() - 0.5) * 0.4,
      seed: random(),
      normal: normalize([out[0], 0.55, out[2]]),
      color: jitterColor(pick(PINE, random), random, 0.14),
      extra: 0.4 + random() * 0.3,
    });
  }
}

/** Trees on the far shore across the lake, in two hazy bands. */
export function buildFarShoreStrokes(): Stroke[] {
  const random = createRandom(WORLD_SEED ^ 0xf0);
  const strokes: Stroke[] = [];
  const band = (zNear: number, zFar: number, span: number, spacing: number, size: number, brush: number, density: number) => {
    for (let x = -span + random() * spacing; x < span; x += spacing * (0.35 + random() * 0.7)) {
      const bay = Math.sin(x * 0.045 + 1.2) * 4 + Math.sin(x * 0.13) * 1.5;
      const z = zNear + bay - random() * (zNear - zFar);
      // Groves: clusters of large trees with gaps of low scrub between them.
      const grove = field(x * 0.6, 3, 2.2);
      const tree = { x, z, size: size * (0.55 + grove * 0.7 + random() * 0.35), brush, density };
      if (random() < 0.35) conifer(strokes, random, tree);
      else deciduousTree(strokes, random, tree);
    }
  };
  band(-104, -120, 160, 6, 1.8, 1.9, 0.45);
  band(-84, -96, 130, 4.2, 1.35, 1.4, 0.7);

  // Shrubs along the far waterline soften where the trees meet the water.
  for (let x = -130; x < 130; x += 0.6 + random() * 0.8) {
    const z = -79.5 - random() * 2.5 + Math.sin(x * 0.045 + 1.2) * 1.5;
    const ground = Math.max(terrainHeight(x, z), WATER_LEVEL);
    strokes.push({
      kind: STROKE_KIND.foliage,
      origin: [x, ground + random() * 1.4, z],
      axis: scale(normalize([(random() - 0.5) * 1.4, -0.3 + random() * 0.6, 0.3]), 1 + random() * 0.8),
      width: 0.7 + random() * 0.5,
      bend: (random() - 0.5) * 0.5,
      seed: random(),
      normal: normalize([(random() - 0.5) * 0.6, 0.7, 0.7]),
      color: jitterColor(pick(FOLIAGE, random), random, 0.2),
      extra: 0.3,
    });
  }
  return strokes;
}

/** Our shore: framing trees at the sides and reeds along the waterline. */
export function buildNearShoreStrokes(): Stroke[] {
  const random = createRandom(WORLD_SEED ^ 0x7e);
  const strokes: Stroke[] = [];
  const framing: [number, number, number][] = [
    [-8.6, 0.2, 1.5],
    [-14, -3.2, 1.3],
    [10.5, -2.8, 1.55],
    [16, 1.5, 1.3],
    [-21, -4.2, 1.2],
    [23, -0.5, 1.35],
  ];
  for (const [x, z, size] of framing) deciduousTree(strokes, random, { x, z, size, brush: 0.5, density: 3.6 });

  for (let x = -70; x < 70; x += 0.12 + random() * 0.25) {
    const clump = field(x * 3, 1, 9.1);
    if (clump < 0.42) continue;
    const shore = shorelineZ(x);
    const z = shore + (random() - 0.6) * 1.3;
    const ground = Math.max(terrainHeight(x, z), WATER_LEVEL - 0.05);
    const height = (0.6 + random() * 1.1) * (0.6 + clump * 0.7);
    strokes.push({
      kind: STROKE_KIND.blade,
      origin: [x, ground - 0.05, z],
      axis: scale(normalize([(random() - 0.5) * 0.4, 1, (random() - 0.5) * 0.3]), height),
      width: 0.035 + random() * 0.03,
      bend: (random() - 0.5) * 0.5,
      seed: random(),
      normal: normalize([0, 0.6, 0.8]),
      color: jitterColor(pick(REEDS, random), random, 0.14),
      extra: 0.15,
    });
    if (random() < 0.06) {
      // Cattail head.
      strokes.push({
        kind: STROKE_KIND.trunk,
        origin: [x, ground + height * 0.82, z],
        axis: [0, height * 0.16, 0],
        width: 0.07,
        bend: 0,
        seed: random(),
        normal: [0, 0, 1],
        color: pick(BARK, random),
        extra: 0.05,
      });
    }
  }
  return strokes;
}

/** Grass blades, wildflowers and raked soil for `bedCount` open beds. */
export function buildMeadowStrokes(bedCount: number): Stroke[] {
  const random = createRandom(WORLD_SEED ^ 0x3a);
  const beds = Array.from({ length: bedCount }, (_, i) => bedAt(i));
  const strokes: Stroke[] = [];
  // 0 = mown lawn around the beds, 1 = long meadow grass.
  const wildness = (x: number, z: number) => {
    const patches = (field(x * 1.3, z * 1.3, 7.1) - 0.62) * 3;
    const nearShore = 1 - (z - shorelineZ(x)) / 1.6;
    const foreground = (z - 13.2) * 0.9;
    const sides = (Math.abs(x) - 14) / 6;
    const lawn = distanceToBeds(x, z, beds) < 1.2 ? -1 : 0;
    return Math.min(1, Math.max(0, patches + lawn, nearShore, foreground, sides));
  };

  for (let z = 15.4; z > -9; ) {
    const d0 = Math.max(0.8, CAMERA_HOME[2] - z);
    const spacing = 0.035 + 0.018 * d0;
    const halfSpan = Math.min(70, d0 * 1.05 + 2.5);
    for (let x = -halfSpan + random() * spacing; x < halfSpan; x += spacing * (0.7 + random() * 0.6)) {
      const px = x + (random() - 0.5) * spacing;
      const pz = z + (random() - 0.5) * spacing;
      if (pz < shorelineZ(px) + 0.15) continue;
      if (distanceToBeds(px, pz, beds) < 0.06) continue;
      const wild = wildness(px, pz);
      if (random() > 0.22 + wild * 0.78) continue;
      // Keep the view into the garden open right in front of the camera.
      if (pz > 13 && Math.abs(px) < 1.1 && random() < 0.85) continue;
      const height = wild > 0.5 ? (0.22 + random() * 0.4) * (pz > 13 ? 1.5 : 1) : 0.05 + random() * 0.07 + wild * 0.15;
      const axis = scale(normalize([(random() - 0.5) * 0.6, 1, (random() - 0.5) * 0.45]), height);
      const ground = terrainHeight(px, pz);
      const sunTip = wild > 0.5 && random() < 0.18;
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [px, ground - 0.02, pz],
        axis,
        width: 0.012 + 0.0042 * d0 + random() * 0.006,
        bend: (random() - 0.5) * 0.7,
        seed: random(),
        normal: normalize([0, 0.7, 0.7]),
        color: jitterColor(scale(pick(sunTip ? GOLDEN_TIPS : BLADES, random), wild > 0.5 ? 1 : 0.7), random, 0.12),
        extra: 0.1 + random() * 0.15,
      });
      if (wild > 0.55 && random() < 0.05) {
        const tip: Vec3 = [px + axis[0], ground + axis[1], pz + axis[2]];
        const color = pick(WILDFLOWERS, random);
        const size = 0.035 + 0.004 * d0;
        for (let p = 0; p < 5; p += 1) {
          const spin = (p / 5) * Math.PI * 2 + random() * 0.4;
          strokes.push({
            kind: STROKE_KIND.petal,
            origin: tip,
            axis: [Math.cos(spin) * size, Math.sin(spin) * size * 0.7, 0.01],
            width: size * 0.8,
            bend: (random() - 0.5) * 0.3,
            seed: random(),
            normal: normalize([0, 0.5, 1]),
            color: jitterColor(color, random, 0.08),
            extra: 0.05,
          });
        }
      }
    }
    z -= spacing * (0.8 + random() * 0.3);
  }

  // Raked soil in every open bed: concentric dabs of umber.
  for (const bed of beds) {
    for (let r = 0.08; r < BED_RADIUS * 0.98; r += 0.1 + random() * 0.03) {
      const steps = Math.max(5, Math.round((Math.PI * 2 * r) / 0.15));
      const offset = random() * Math.PI * 2;
      for (let s = 0; s < steps; s += 1) {
        const a = offset + (s / steps) * Math.PI * 2 + (random() - 0.5) * 0.2;
        const x = bed.center[0] + Math.cos(a) * r;
        const z = bed.center[2] + Math.sin(a) * r;
        strokes.push({
          kind: STROKE_KIND.surface,
          origin: [x, terrainHeight(x, z) + 0.012, z],
          axis: scale([-Math.sin(a), 0, Math.cos(a)], 0.2 + random() * 0.12),
          width: 0.1 + random() * 0.05,
          bend: (random() - 0.5) * 0.4,
          seed: random(),
          normal: [0, 1, 0],
          color: jitterColor(pick(SOIL, random), random, 0.12),
          extra: 0.2 + random() * 0.2,
        });
      }
    }
  }
  return strokes;
}

export interface MeshData {
  /** Interleaved float vertex data. */
  readonly vertices: Float32Array<ArrayBuffer>;
  readonly indices: Uint32Array<ArrayBuffer>;
  /** Floats per vertex. */
  readonly stride: number;
}

/** Floats per ground vertex: position(3) normal(3). */
export const GROUND_STRIDE = 6;

/** Terrain: meadow, shore bank, lakebed and the far shore. */
export function buildGroundMesh(): MeshData {
  const minX = -160;
  const maxX = 160;
  const minZ = -140;
  const maxZ = 18;
  const columns = 160;
  const rows = 140;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const v = j / rows;
    const z = maxZ - (maxZ - minZ) * v * v;
    for (let i = 0; i <= columns; i += 1) {
      const x = minX + ((maxX - minX) * i) / columns;
      const e = 0.05;
      const nx = -(terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
      const nz = -(terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
      const length = Math.hypot(nx, 1, nz);
      vertices.push(x, terrainHeight(x, z) - 0.01, z, nx / length, 1 / length, nz / length);
    }
  }
  const row = columns + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), stride: GROUND_STRIDE };
}

/** Floats per bed vertex: position(3) normal(3) local(3). */
export const BED_STRIDE = 9;

/** Dark soil underpainting discs for each open bed. */
export function buildBedMesh(bedCount: number): MeshData {
  const segments = 40;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < bedCount; b += 1) {
    const bed = bedAt(b);
    const first = vertices.length / BED_STRIDE;
    vertices.push(bed.center[0], bed.center[1] + 0.005, bed.center[2], 0, 1, 0, 0, 0, b);
    for (let s = 0; s < segments; s += 1) {
      const angle = (s / segments) * Math.PI * 2;
      const lx = Math.cos(angle);
      const lz = Math.sin(angle);
      const x = bed.center[0] + lx * BED_RADIUS;
      const z = bed.center[2] + lz * BED_RADIUS;
      vertices.push(x, terrainHeight(x, z) + 0.005, z, 0, 1, 0, lx, lz, b);
    }
    for (let s = 0; s < segments; s += 1) {
      indices.push(first, first + 1 + ((s + 1) % segments), first + 1 + s);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), stride: BED_STRIDE };
}
