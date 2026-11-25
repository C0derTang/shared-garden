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
import { shoreRocks } from "./landforms";
import { STROKE_KIND, createRandom, jitterColor, type Stroke } from "./strokes";

const WORLD_SEED = 0x6a7d2026;

const palette = (hexes: readonly string[]) => hexes.map((hex) => hexToLinear(hex) as Vec3);

const BLADES = palette(["#5d7038", "#6d7c3e", "#7f8a48", "#4f6230", "#9a9a58", "#a99f5e", "#435a2c"]);
const SOIL = palette(["#5b3a24", "#6e4a2c", "#7d5634", "#4a2f1f", "#8a6440"]);
const FOLIAGE = palette(["#3a5a2c", "#466632", "#577638", "#668343", "#2e4a28", "#748c48", "#4f6a3a"]);
const PINE = palette(["#2a4a34", "#315440", "#3b6148", "#24402e", "#436a52"]);
const BARK = palette(["#3a2a20", "#4a3526", "#2d221b", "#56402c"]);
const REEDS = palette(["#6b7a3a", "#7f8a45", "#9a9250", "#5b6a33", "#a8975a"]);
const GOLDEN_TIPS = palette(["#b9b062", "#c9b56a", "#a9a45a"]);
const WILDFLOWERS = palette(["#f2a7b8", "#f6f0e4", "#f3cf5c", "#b9a6e8", "#ee8a6d", "#f7d9e3"]);

/** Shared paint palettes (linear light) for other compositions such as the landing. */
export const SCENERY_PALETTES = { BLADES, SOIL, FOLIAGE, PINE, BARK, REEDS, GOLDEN_TIPS, WILDFLOWERS } as const;

export function pick<T>(items: readonly T[], random: () => number): T {
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

export interface TreeOptions {
  readonly x: number;
  readonly z: number;
  readonly size: number;
  /** Crown proportions: < 1 narrows (columnar poplars), height stretches. */
  readonly widthScale?: number;
  readonly heightScale?: number;
  /** Stroke size multiplier (bigger, looser strokes far away). */
  readonly brush: number;
  readonly density: number;
  /** Ground height under the trunk; defaults to the garden's terrain. */
  readonly ground?: (x: number, z: number) => number;
}

function leafTangent(normal: Vec3, random: () => number): Vec3 {
  // Leaves droop: tangent toward gravity, swung randomly about the normal.
  const d = -normal[1];
  const tangent = normalize([-normal[0] * d, -1 - normal[1] * d, -normal[2] * d]);
  const side = normalize(cross(normal, tangent));
  const swing = (random() - 0.5) * 1.8;
  return normalize([
    tangent[0] * Math.cos(swing) + side[0] * Math.sin(swing),
    tangent[1] * Math.cos(swing) + side[1] * Math.sin(swing),
    tangent[2] * Math.cos(swing) + side[2] * Math.sin(swing),
  ]);
}

/**
 * A broadleaf tree: a trunk forking into branches, each carrying a clump of
 * leaf cards. Clumps give an irregular silhouette with lit and shaded sides;
 * leaves deep in the crown are darker.
 */
export function deciduousTree(strokes: Stroke[], random: () => number, tree: TreeOptions): void {
  const ground = (tree.ground ?? terrainHeight)(tree.x, tree.z);
  const widthScale = tree.widthScale ?? 1;
  const heightScale = tree.heightScale ?? 1;
  const trunkHeight = (1.5 + random() * 1.4) * tree.size * Math.sqrt(heightScale);
  const rx = (1.7 + random() * 1.1) * tree.size * widthScale;
  const ry = (1.6 + random() * 1.2) * tree.size * heightScale;
  const rz = rx * 0.85;
  const crown: Vec3 = [tree.x + (random() - 0.5) * 0.4 * tree.size, ground + trunkHeight + ry * 0.75, tree.z];
  const leafTint = jitterColor([1, 1, 1], random, 0.12);
  const fork: Vec3 = [tree.x, ground + trunkHeight * 0.9, tree.z];

  // Trunk: a few overlapping bark strokes, slightly leaning.
  const lean = (random() - 0.5) * 0.3 * tree.size;
  for (let i = 0; i < 3; i += 1) {
    strokes.push({
      kind: STROKE_KIND.trunk,
      origin: [tree.x + (random() - 0.5) * 0.18 * tree.size, ground - 0.05, tree.z + 0.05],
      axis: [lean, trunkHeight, 0],
      width: (0.2 + random() * 0.1) * tree.size,
      bend: (random() - 0.5) * 0.15,
      seed: random(),
      normal: [0, 0, 1],
      color: jitterColor(pick(BARK, random), random, 0.12),
      extra: 0.35,
    });
  }

  const clumps = 5 + Math.floor(random() * 5);
  const perClump = Math.round((180 * tree.size * tree.size * tree.density) / clumps);
  for (let c = 0; c < clumps; c += 1) {
    const u = random() * 1.6 - 0.6;
    const phi = random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const out: Vec3 = [s * Math.cos(phi), u, s * Math.sin(phi) * 0.8 + 0.2];
    const reach = 0.45 + random() * 0.25;
    const center: Vec3 = [crown[0] + out[0] * rx * reach, crown[1] + out[1] * ry * reach, crown[2] + out[2] * rz * reach];
    const radius = (0.42 + random() * 0.3) * Math.min(rx, ry);
    // Branch from the fork to the clump.
    strokes.push({
      kind: STROKE_KIND.trunk,
      origin: [fork[0] + lean, fork[1], fork[2]],
      axis: scale([center[0] - fork[0] - lean, center[1] - fork[1], center[2] - fork[2]], 0.85),
      width: (0.07 + random() * 0.05) * tree.size,
      bend: (random() - 0.5) * 0.4,
      seed: random(),
      normal: [0, 0, 1],
      color: jitterColor(pick(BARK, random), random, 0.12),
      extra: 0.4,
    });
    const outward = normalize([center[0] - crown[0], center[1] - crown[1] + 0.3, center[2] - crown[2]]);
    for (let i = 0; i < perClump; i += 1) {
      const lu = random() * 2 - 1;
      const lphi = random() * Math.PI * 2;
      const ls = Math.sqrt(1 - lu * lu);
      let dir: Vec3 = [ls * Math.cos(lphi), lu, ls * Math.sin(lphi)];
      if (dir[2] < -0.2 && random() < 0.7) dir = [dir[0], dir[1], -dir[2]];
      const depth = 0.7 + random() * 0.32;
      const point: Vec3 = [center[0] + dir[0] * radius * depth, center[1] + dir[1] * radius * depth * 0.85, center[2] + dir[2] * radius * depth];
      const normal = normalize([dir[0] + outward[0] * 0.8, dir[1] + outward[1] * 0.8, dir[2] + outward[2] * 0.8]);
      // Shade the inside of each clump and the clumps facing into the crown.
      const occlusion = (0.45 + 0.55 * (depth - 0.7) / 0.32) * (0.65 + 0.35 * (dir[0] * outward[0] + dir[1] * outward[1] + dir[2] * outward[2] + 1) * 0.5);
      const base = pick(FOLIAGE, random);
      strokes.push({
        kind: STROKE_KIND.foliage,
        origin: point,
        axis: scale(leafTangent(normal, random), (0.32 + random() * 0.3) * tree.brush * tree.size),
        width: (0.2 + random() * 0.14) * tree.brush * tree.size,
        bend: (random() - 0.5) * 0.7,
        seed: random(),
        normal,
        color: jitterColor(scale([base[0] * leafTint[0], base[1] * leafTint[1], base[2] * leafTint[2]], occlusion), random, 0.15),
        extra: 0.15 + random() * 0.2,
      });
    }
  }
}

export function conifer(strokes: Stroke[], random: () => number, tree: TreeOptions): void {
  const ground = (tree.ground ?? terrainHeight)(tree.x, tree.z);
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
      const tree = { x, z, size: size * (0.45 + grove * 0.8 + random() * 0.45), brush, density };
      const kind = random();
      if (kind < 0.42) conifer(strokes, random, { ...tree, size: tree.size * (0.8 + random() * 0.6) });
      else if (kind < 0.58) deciduousTree(strokes, random, { ...tree, widthScale: 0.45, heightScale: 1.7 });
      else deciduousTree(strokes, random, { ...tree, widthScale: 0.8 + random() * 0.5, heightScale: 0.7 + random() * 0.6 });
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

  // Grass tufts hugging the shore and foreground stones.
  for (const rock of shoreRocks()) {
    const tufts = 8 + Math.floor(random() * 10);
    for (let i = 0; i < tufts; i += 1) {
      const a = random() * Math.PI * 2;
      const r = rock.radius * (0.85 + random() * 0.35);
      const x = rock.x + Math.cos(a) * r;
      const z = rock.z + Math.sin(a) * r;
      const ground = Math.max(terrainHeight(x, z), WATER_LEVEL - 0.05);
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [x, ground - 0.03, z],
        axis: scale(normalize([Math.cos(a) * 0.5, 1, Math.sin(a) * 0.4]), 0.18 + random() * 0.35),
        width: 0.03 + random() * 0.02,
        bend: (random() - 0.5) * 0.6,
        seed: random(),
        normal: normalize([0, 0.7, 0.7]),
        color: jitterColor(pick(random() < 0.3 ? GOLDEN_TIPS : BLADES, random), random, 0.14),
        extra: 0.15,
      });
    }
  }

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
      // The mown lawn is left to the painted ground; strands grow where the meadow runs wild.
      if (wild < 0.3 || random() > wild) continue;
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
        color: jitterColor(scale(pick(sunTip ? GOLDEN_TIPS : BLADES, random), wild > 0.5 ? 1 : 0.95), random, 0.08),
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

export interface HeightfieldGrid {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly columns: number;
  readonly rows: number;
  /**
   * Column spacing exponent around x = 0: 1 is uniform; larger values pack
   * columns near the middle of the view.
   */
  readonly xPower?: number;
}

/** A ground heightfield, denser toward the viewer (+z) and, optionally, toward x = 0. */
export function buildHeightfieldMesh(height: (x: number, z: number) => number, grid: HeightfieldGrid): MeshData {
  const { minX, maxX, minZ, maxZ, columns, rows } = grid;
  const power = grid.xPower ?? 1;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const v = j / rows;
    const z = maxZ - (maxZ - minZ) * v * v;
    for (let i = 0; i <= columns; i += 1) {
      const s = i / columns;
      let x = minX + (maxX - minX) * s;
      if (power !== 1) {
        const signed = s * 2 - 1;
        const reach = signed < 0 ? -minX : maxX;
        x = Math.sign(signed) * reach * Math.abs(signed) ** power;
      }
      const e = 0.05;
      const nx = -(height(x + e, z) - height(x - e, z)) / (2 * e);
      const nz = -(height(x, z + e) - height(x, z - e)) / (2 * e);
      const length = Math.hypot(nx, 1, nz);
      vertices.push(x, height(x, z) - 0.01, z, nx / length, 1 / length, nz / length);
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

/** Terrain: meadow, shore bank, lakebed and the far shore. */
export function buildGroundMesh(): MeshData {
  return buildHeightfieldMesh(terrainHeight, { minX: -160, maxX: 160, minZ: -140, maxZ: 18, columns: 160, rows: 140 });
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
