/**
 * The landing composition of the painted world: a cozy lakeside house front
 * in a forest clearing, the lake opening to the left toward the far shore and
 * mountains. Pure data (terrain, house mesh, brushstrokes, camera poses and the
 * walk-through timeline), no GPU calls, so it can be unit tested.
 *
 * World axes match the garden: +y up, -z is west (toward the sunset), +x is
 * north. The house stands at the origin with its front turned toward the
 * east-southeast, so the viewer looks at it from the clearing with the lake
 * on the left.
 */

import { rayHitsUprightCapsule, type Ray } from "./camera";
import type { JourneyPose } from "./journey";
import type { Vec3 } from "./layout";
import type { Rock } from "./landforms";
import { valueNoise } from "./landforms";
import {
  SCENERY_PALETTES,
  buildHeightfieldMesh,
  conifer,
  deciduousTree,
  field,
  pick,
  type MeshData,
} from "./scenery";
import { hexToLinear } from "./sky-palette";
import { STROKE_KIND, createRandom, jitterColor, type Stroke } from "./strokes";
import { FRONT_NORMAL, HOUSE, designToHouse, designToWorld, houseDirection, houseToDesign, houseToWorld, worldToHouse } from "./landing-frame";

const LANDING_SEED = 0x1a4e5ade;
const { BLADES, FOLIAGE, REEDS, GOLDEN_TIPS, WILDFLOWERS } = SCENERY_PALETTES;
const palette = (hexes: readonly string[]) => hexes.map((hex) => hexToLinear(hex) as Vec3);
const HYDRANGEA = palette(["#9fb4ea", "#b7a4e2", "#f1b9cf", "#f6eef0", "#8ea7e0"]);
const GERANIUM = palette(["#e0484c", "#ef6f6a", "#f39ab0", "#f6ede4", "#d93a52"]);
const FERN = palette(["#4f7a33", "#5f8a3a", "#3f6a2c", "#6d9442"]);
const BIRCH = palette(["#e8e2d4", "#d9d2c2", "#f0ebe0"]);

// ---------------------------------------------------------------------------
// Terrain and lake

/** Height of the lake surface (same as the garden). */
export const LANDING_WATER_LEVEL = -0.35;

// The landing is laid out in a "design" space (see ./landing-frame).

/** Design x of the lakeshore at design depth z; the lake lies at smaller x (west). */
export function landingShoreX(z: number): number {
  return -7.6 + 0.9 * Math.sin(0.23 * z + 0.5) + 0.4 * Math.sin(0.61 * z - 1.2) - 0.3 * Math.max(0, z - 6) + 0.18 * Math.min(0, z + 12);
}

function designLakeDepth(x: number, z: number): number {
  return landingShoreX(z) - x;
}

/**
 * Distance-like depth into the lake at a world position (positive in the
 * water, negative on land). Must match `landingLakeDepth` in `shaders/water.wgsl`.
 */
export function landingLakeDepth(x: number, z: number): number {
  return designLakeDepth(z, -x);
}

function designTerrain(x: number, z: number): number {
  const floor = 0.06 * Math.sin(x * 0.27 + 0.4) * Math.cos(z * 0.21 - 0.3) + 0.03 * Math.sin(x * 0.71 - z * 0.55 + 1.1);
  // The forest floor climbs gently away from the clearing on the right and far ahead.
  const rise = 0.7 * smoothstep(9, 30, x) + 1.2 * smoothstep(-30, -70, z);
  const into = designLakeDepth(x, z);
  const bank = into <= -1.5 ? 0 : into <= 0 ? -0.25 * ((into + 1.5) / 1.5) ** 2 : -0.25 - Math.min(2.5, into * 0.35);
  return floor + rise * smoothstep(-1.5, -4, into) + bank;
}

/** Ground height at a world position: forest floor, lake bank and lakebed, and the garden's far western shore. */
export function landingTerrainHeight(x: number, z: number): number {
  const farShore = z < -78 ? Math.min(2.8, (-78 - z) * 0.35) : 0;
  return designTerrain(z, -x) + farShore;
}

/** Ground height at a design-space position. */
function designGround(x: number, z: number): number {
  const [wx, , wz] = designToWorld([x, 0, z]);
  return landingTerrainHeight(wx, wz);
}

/** Ground heightfield of the landing (world space), dense around the clearing. */
export function buildLandingGroundMesh(): MeshData {
  const mesh = buildHeightfieldMesh(designGround, { minX: -160, maxX: 160, minZ: -150, maxZ: 32, columns: 220, rows: 170, xPower: 1.7 });
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += mesh.stride) {
    const [px, py, pz] = designToWorld([v[i]!, v[i + 1]!, v[i + 2]!]);
    const [nx, ny, nz] = designToWorld([v[i + 3]!, v[i + 4]!, v[i + 5]!]);
    v[i] = px;
    v[i + 1] = py;
    v[i + 2] = pz;
    v[i + 3] = nx;
    v[i + 4] = ny;
    v[i + 5] = nz;
  }
  return mesh;
}

/** Corners of the lake's water plane in world xz (it reaches around the viewer's left). */
export const LANDING_WATER_EXTENT = { minX: -34, maxX: 200, minZ: -260, maxZ: 260 } as const;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// The house

// The house's frame (yaw, size, door and caption anchors) lives in
// ./landing-frame so the landing page can import its anchors without this
// module's geometry.
export {
  DOOR_CAPTION,
  DOOR_HINGE,
  FRONT_NORMAL,
  HOUSE,
  HOUSE_YAW,
  PORCH_LIGHT,
  designToWorld,
  houseToWorld,
  worldToDesign,
  worldToHouse,
} from "./landing-frame";

/** Porch posts either side of the steps stand clear of the door in the viewer's line of sight. */
const INNER_POST = 2.45;
const STEP_HALF_WIDTH = 1.7;
/** Largest swing of the door into the house (radians). */
export const DOOR_OPEN_ANGLE = (104 * Math.PI) / 180;

/** Materials of the house mesh (read by `shaders/house.wgsl`). */
export const HOUSE_MATERIAL = {
  siding: 0,
  trim: 1,
  stone: 2,
  roof: 3,
  glass: 4,
  door: 5,
  plank: 6,
  interior: 7,
  lantern: 8,
  frame: 9,
} as const;

/** Floats per house vertex: position(3) normal(3) uv(2) material(1). */
export const HOUSE_STRIDE = 9;

type Material = (typeof HOUSE_MATERIAL)[keyof typeof HOUSE_MATERIAL];

class MeshBuilder {
  readonly vertices: number[] = [];
  readonly indices: number[] = [];

  /** A quad in house-local space (corners in order around the face). */
  quad(corners: readonly Vec3[], normal: Vec3, uvs: readonly [number, number][], material: Material): void {
    const first = this.vertices.length / HOUSE_STRIDE;
    const n = houseDirection(normal);
    corners.forEach((corner, i) => {
      const p = houseToWorld(corner);
      this.vertices.push(p[0], p[1], p[2], n[0], n[1], n[2], uvs[i]![0], uvs[i]![1], material);
    });
    if (corners.length === 4) this.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    else this.indices.push(first, first + 1, first + 2);
  }

  /**
   * An oriented box: `center` plus half-axes `u`, `v`, `w` (house-local).
   * Faces get planar uvs in metres from house-local coordinates so boards and
   * courses line up across pieces. `materials` picks each face's material by
   * its outward axis; `skip` omits faces.
   */
  box(
    center: Vec3,
    u: Vec3,
    v: Vec3,
    w: Vec3,
    materials: Material | Partial<Record<"+u" | "-u" | "+v" | "-v" | "+w" | "-w", Material>> & { rest: Material },
    skip: readonly string[] = [],
    uvMode: "planar" | "axes" = "planar",
  ): void {
    const axes: [string, Vec3, Vec3, Vec3][] = [
      ["+u", u, v, w],
      ["-u", neg(u), w, v],
      ["+v", v, w, u],
      ["-v", neg(v), u, w],
      ["+w", w, u, v],
      ["-w", neg(w), v, u],
    ];
    for (const [name, out, a, b] of axes) {
      if (skip.includes(name)) continue;
      const material = typeof materials === "number" ? materials : (materials[name as "+u"] ?? materials.rest);
      const c = add(center, out);
      const corners: Vec3[] = [
        add(add(c, neg(a)), neg(b)),
        add(add(c, a), neg(b)),
        add(add(c, a), b),
        add(add(c, neg(a)), b),
      ];
      const normal = normalize(out);
      const ua = normalize(a);
      const ub = normalize(b);
      const uv = (corner: Vec3): [number, number] =>
        uvMode === "axes" ? [dot(corner, ua), dot(corner, ub)] : planarUv(corner, normal);
      this.quad(corners, normal, corners.map(uv), material);
    }
  }

  /** Axis-aligned box in house-local space. */
  aabox(min: Vec3, max: Vec3, materials: Parameters<MeshBuilder["box"]>[4], skip: readonly string[] = []): void {
    const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    this.box(center, [(max[0] - min[0]) / 2, 0, 0], [0, (max[1] - min[1]) / 2, 0], [0, 0, (max[2] - min[2]) / 2], materials, skip);
  }

  mesh(): MeshData {
    return { vertices: new Float32Array(this.vertices), indices: new Uint32Array(this.indices), stride: HOUSE_STRIDE };
  }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function neg(a: Vec3): Vec3 {
  return [-a[0], -a[1], -a[2]];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Planar uv in metres for a face with `normal` (house-local): (horizontal, vertical/along). */
function planarUv(p: Vec3, normal: Vec3): [number, number] {
  const ax = Math.abs(normal[0]);
  const ay = Math.abs(normal[1]);
  const az = Math.abs(normal[2]);
  if (ay >= ax && ay >= az) return [p[0], p[2]];
  if (ax >= az) return [p[2], p[1]];
  return [p[0], p[1]];
}

/** A flat window pane on the front (or right) wall with normalized uvs for mullions. */
function windowPane(
  builder: MeshBuilder,
  face: "front" | "right",
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  material: Material = HOUSE_MATERIAL.glass,
): void {
  const uvs: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  if (face === "front") {
    const z = 0.012;
    builder.quad([[a0, y0, z], [a1, y0, z], [a1, y1, z], [a0, y1, z]], [0, 0, 1], uvs, material);
  } else {
    const x = HOUSE.halfWidth + 0.012;
    builder.quad([[x, y0, a1], [x, y0, a0], [x, y1, a0], [x, y1, a1]], [1, 0, 0], uvs, material);
  }
}

/** Trim around a front window: head, sill, jambs and a flower box below. */
function frontWindowTrim(builder: MeshBuilder, x0: number, x1: number, y0: number, y1: number, flowerBox: boolean): void {
  const t = 0.11;
  const out = 0.07;
  builder.aabox([x0 - t, y1, 0], [x1 + t, y1 + t * 1.3, out + 0.02], HOUSE_MATERIAL.trim);
  builder.aabox([x0 - t * 1.3, y0 - t, 0], [x1 + t * 1.3, y0, out + 0.06], HOUSE_MATERIAL.trim);
  builder.aabox([x0 - t, y0, 0], [x0, y1, out], HOUSE_MATERIAL.trim);
  builder.aabox([x1, y0, 0], [x1 + t, y1, out], HOUSE_MATERIAL.trim);
  // Mullion bars are painted by the glass shader; frames read as depth here.
  if (flowerBox) builder.aabox([x0 - 0.05, y0 - t - 0.3, 0], [x1 + 0.05, y0 - t - 0.04, 0.32], HOUSE_MATERIAL.plank);
}

/** Front windows (house-local x ranges and heights) shared by the mesh and the flower boxes. */
export const FRONT_WINDOWS = [
  { x0: -3.15, x1: -1.55, y0: 1.45, y1: 2.85 },
  { x0: 1.55, x1: 3.15, y0: 1.45, y1: 2.85 },
] as const;

/**
 * The house: stone foundation and chimney, clapboard walls, a steep gabled
 * roof, a covered porch with posts, railings and steps, warm windows, porch
 * lanterns, the plank door (hinged in the shader) and a glowing interior that
 * shows when the door opens.
 */
export function buildHouseMesh(): MeshData {
  const b = new MeshBuilder();
  const { halfWidth: W, depth: D, floor: F, eaves: E, ridge: R, door } = HOUSE;
  const M = HOUSE_MATERIAL;
  const wall = 0.2;

  // Foundation and porch base.
  b.aabox([-W - 0.12, -0.6, -D - 0.12], [W + 0.12, F, 0.03], M.stone);
  b.aabox([-3.25, -0.4, 0], [3.25, F - 0.16, HOUSE.porchDepth - 0.05], M.stone);

  // Walls. The front wall leaves an opening for the door.
  b.aabox([-W, F, -wall], [door.minX, E, 0], M.siding);
  b.aabox([door.maxX, F, -wall], [W, E, 0], M.siding);
  b.aabox([door.minX, door.maxY, -wall], [door.maxX, E, 0], M.siding);
  b.aabox([-W, F, -D], [-W + wall, E, -wall], M.siding);
  b.aabox([W - wall, F, -D], [W, E, -wall], M.siding);
  b.aabox([-W, F, -D], [W, E, -D + wall], M.siding);
  // Gable ends.
  const gable = (z: number, normal: number) => {
    const corners: Vec3[] = [
      [-W, E - 0.01, z],
      [W, E - 0.01, z],
      [0, R - 0.12, z],
    ];
    const ordered = normal > 0 ? corners : [corners[1]!, corners[0]!, corners[2]!];
    b.quad(ordered, [0, 0, normal], ordered.map((c) => [c[0], c[1]] as [number, number]), M.siding);
  };
  gable(0.001, 1);
  gable(-D - 0.001, -1);
  // Corner boards.
  for (const x of [-W - 0.03, W - 0.12]) b.aabox([x, F, -0.05], [x + 0.15, E, 0.05], M.trim);

  // Roof: two thick slabs meeting at the ridge, overhanging every wall.
  const eaveX = W + 0.55;
  const eaveY = E - 0.32;
  const front = 0.6;
  const back = -D - 0.5;
  const thickness = 0.09;
  for (const side of [-1, 1]) {
    const n = normalize([side * (R - eaveY), eaveX, 0]);
    const center: Vec3 = [(side * eaveX) / 2 + n[0] * thickness, (eaveY + R) / 2 + n[1] * thickness, (front + back) / 2];
    const along: Vec3 = [(-side * eaveX) / 2, (R - eaveY) / 2, 0];
    b.box(
      center,
      [0, 0, (front - back) / 2],
      along,
      [n[0] * thickness, n[1] * thickness, 0],
      { "+w": M.roof, rest: M.trim },
      [],
      "axes",
    );
  }
  // Ridge cap.
  b.aabox([-0.12, R + 0.02, back], [0.12, R + 0.16, front], M.roof);

  // Chimney on the right side wall.
  b.aabox([W + 0.02, -0.5, -4.35], [W + 0.8, R + 0.9, -3.05], M.stone);
  b.aabox([W - 0.05, R + 0.9, -4.45], [W + 0.88, R + 1.02, -2.95], M.trim);

  // Porch: floor, steps, posts, beam, shed roof and railings.
  b.aabox([-3.3, F - 0.16, 0], [3.3, F, HOUSE.porchDepth], M.plank);
  const steps = [
    [0.15, 3.1],
    [0.3, 2.8],
    [0.45, 2.5],
  ] as const;
  for (const [top, reach] of steps) b.aabox([-STEP_HALF_WIDTH, -0.2, HOUSE.porchDepth - 0.02], [STEP_HALF_WIDTH, top, reach], M.plank);
  const postZ = HOUSE.porchDepth - 0.17;
  for (const x of [-3.12, -INNER_POST, INNER_POST, 3.12]) b.aabox([x - 0.075, F, postZ - 0.075], [x + 0.075, 3.0, postZ + 0.075], M.trim);
  b.aabox([-3.3, 2.88, postZ - 0.1], [3.3, 3.06, postZ + 0.1], M.trim);
  const porchRoofN = normalize([0, HOUSE.porchDepth + 0.25, 0.42]);
  b.box(
    [0, (3.42 + 3.0) / 2 + porchRoofN[1] * 0.06, (HOUSE.porchDepth + 0.25) / 2 + porchRoofN[2] * 0.06],
    [3.5, 0, 0],
    [0, -0.21, (HOUSE.porchDepth + 0.25) / 2],
    [0, porchRoofN[1] * 0.06, porchRoofN[2] * 0.06],
    { "+w": M.roof, rest: M.trim },
    [],
    "axes",
  );
  for (const [x0, x1] of [
    [-3.12, -INNER_POST],
    [INNER_POST, 3.12],
  ] as const) {
    b.aabox([x0, 1.42, postZ - 0.05], [x1, 1.5, postZ + 0.05], M.trim);
    b.aabox([x0, 0.72, postZ - 0.04], [x1, 0.78, postZ + 0.04], M.trim);
    for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.2) b.aabox([x - 0.022, 0.78, postZ - 0.022], [x + 0.022, 1.42, postZ + 0.022], M.trim);
  }
  for (const x of [-3.12, 3.12]) b.aabox([x - 0.04, 1.42, 0.05], [x + 0.04, 1.5, postZ], M.trim);

  // Door frame and the door itself (hinged on its left edge in the shader).
  const jamb = 0.13;
  b.aabox([door.minX - jamb, F, -0.02], [door.minX, door.maxY + jamb, 0.08], M.trim);
  b.aabox([door.maxX, F, -0.02], [door.maxX + jamb, door.maxY + jamb, 0.08], M.trim);
  b.aabox([door.minX - jamb - 0.04, door.maxY, -0.02], [door.maxX + jamb + 0.04, door.maxY + jamb + 0.05, 0.1], M.trim);
  const doorUv = (c: Vec3): [number, number] => [(c[0] - door.minX) / (door.maxX - door.minX), (c[1] - door.minY) / (door.maxY - door.minY)];
  const dz0 = door.z - 0.03;
  const dz1 = door.z + 0.03;
  const dx0 = door.minX + 0.005;
  const dx1 = door.maxX - 0.005;
  const doorFace = (corners: Vec3[], normal: Vec3) => b.quad(corners, normal, corners.map(doorUv), M.door);
  doorFace([[dx0, door.minY, dz1], [dx1, door.minY, dz1], [dx1, door.maxY, dz1], [dx0, door.maxY, dz1]], [0, 0, 1]);
  doorFace([[dx1, door.minY, dz0], [dx0, door.minY, dz0], [dx0, door.maxY, dz0], [dx1, door.maxY, dz0]], [0, 0, -1]);
  doorFace([[dx1, door.minY, dz1], [dx1, door.minY, dz0], [dx1, door.maxY, dz0], [dx1, door.maxY, dz1]], [1, 0, 0]);
  doorFace([[dx0, door.minY, dz0], [dx0, door.minY, dz1], [dx0, door.maxY, dz1], [dx0, door.maxY, dz0]], [-1, 0, 0]);
  doorFace([[dx0, door.maxY, dz1], [dx1, door.maxY, dz1], [dx1, door.maxY, dz0], [dx0, door.maxY, dz0]], [0, 1, 0]);

  // Lanterns either side of the door.
  for (const x of [-1.0, 1.0]) {
    b.aabox([x - 0.1, 1.95, 0.02], [x + 0.1, 2.28, 0.22], M.lantern);
    b.aabox([x - 0.13, 2.28, 0.0], [x + 0.13, 2.34, 0.25], M.frame);
    b.aabox([x - 0.03, 2.34, 0.0], [x + 0.03, 2.42, 0.06], M.frame);
  }

  // Windows: two flanking the door, one in the gable and one on the right side.
  FRONT_WINDOWS.forEach((w) => {
    windowPane(b, "front", w.x0, w.x1, w.y0, w.y1);
    frontWindowTrim(b, w.x0, w.x1, w.y0, w.y1, true);
  });
  windowPane(b, "front", -0.5, 0.5, 4.25, 5.15);
  frontWindowTrim(b, -0.5, 0.5, 4.25, 5.15, false);
  windowPane(b, "right", -2.5, -1.05, 1.45, 2.85);
  const rx = W;
  b.aabox([rx, 2.85, -2.62], [rx + 0.08, 2.99, -0.93], M.trim);
  b.aabox([rx, 1.34, -2.66], [rx + 0.12, 1.45, -0.89], M.trim);
  b.aabox([rx, 1.45, -2.62], [rx + 0.07, 2.85, -2.5], M.trim);
  b.aabox([rx, 1.45, -1.05], [rx + 0.07, 2.85, -0.93], M.trim);

  // The lit room behind the door (no front face, so it shows through the doorway).
  b.aabox([-W + wall + 0.01, F + 0.001, -D + wall + 0.01], [W - wall - 0.01, E - 0.05, -wall - 0.005], M.interior, ["+w"]);
  return b.mesh();
}

/** Door hit test: ray against the doorway (plus a forgiving margin); distance or null. */
export function rayHitsDoor(ray: Ray): number | null {
  const origin = worldToHouse(ray.origin);
  const direction = worldToHouse(ray.direction);
  if (Math.abs(direction[2]) < 1e-6) return null;
  const s = (0.05 - origin[2]) / direction[2];
  if (s <= 0) return null;
  const x = origin[0] + direction[0] * s;
  const y = origin[1] + direction[1] * s;
  const { door } = HOUSE;
  const margin = 0.25;
  return x >= door.minX - margin && x <= door.maxX + margin && y >= door.minY - 0.1 && y <= door.maxY + margin ? s : null;
}

// ---------------------------------------------------------------------------
// Stones

/** Stepping stones up to the porch, boulders by the water and in the forest. */
export function landingRocks(): Rock[] {
  const random = createRandom(LANDING_SEED ^ 0x57);
  const rocks: Rock[] = [];
  for (const p of pathPoints()) {
    const radius = 0.24 + random() * 0.1;
    rocks.push({ x: p[0] + (random() - 0.5) * 0.15, z: p[1] + (random() - 0.5) * 0.1, radius, height: 0.1 + random() * 0.05, seed: random(), moss: 0.75 });
  }
  for (let z = 14; z > -30; z -= 1.1 + random() * 2.2) {
    if (valueNoise(z * 0.21, 1.7) < 0.4) continue;
    const cluster = 1 + Math.floor(random() * 3);
    for (let i = 0; i < cluster; i += 1) {
      const x = landingShoreX(z) + (random() - 0.4) * 1.3;
      const radius = 0.2 + random() * 0.55;
      rocks.push({ x, z: z + (random() - 0.5) * 1.2, radius, height: radius * (0.5 + random() * 0.4), seed: random(), moss: random() * 0.7 });
    }
  }
  for (const [x, z, radius] of [
    [6.5, 9.5, 0.7],
    [7.4, 10.4, 0.38],
    [-4.4, 11.6, 0.5],
    [10.5, 2.5, 0.9],
    [-5.6, 5.2, 0.42],
  ] as const) {
    rocks.push({ x, z, radius, height: radius * 0.6, seed: random(), moss: 0.85 });
  }
  return rocks.map((rock) => ({ ...rock, x: -rock.z, z: rock.x }));
}

/** Stepping-stone centres (design xz) from the clearing up to the porch steps. */
export function pathPoints(): [number, number][] {
  const start = houseToDesign([0, 0, 3.55]);
  const points: [number, number][] = [];
  const controls: [number, number][] = [
    [start[0], start[2]],
    [start[0] + 0.6, start[2] + 3.2],
    [2.9, 11.5],
    [2.2, 18.5],
  ];
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    const a = 1 - t;
    const x = a ** 3 * controls[0]![0] + 3 * a * a * t * controls[1]![0] + 3 * a * t * t * controls[2]![0] + t ** 3 * controls[3]![0];
    const z = a ** 3 * controls[0]![1] + 3 * a * a * t * controls[1]![1] + 3 * a * t * t * controls[2]![1] + t ** 3 * controls[3]![1];
    points.push([x, z]);
  }
  return points;
}

function distanceToPath(x: number, z: number, path: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** True inside the house, porch, steps or chimney footprint (plus `margin`). */
export function insideHouse(x: number, z: number, margin = 0): boolean {
  const [lx, , lz] = designToHouse([x, 0, z]);
  const body = Math.abs(lx) < HOUSE.halfWidth + 0.15 + margin && lz > -HOUSE.depth - 0.15 - margin && lz < 0.05 + margin;
  const porch = lx > -3.35 - margin && lx < 3.35 + margin && lz >= 0 && lz < HOUSE.porchDepth + margin;
  const steps = Math.abs(lx) < STEP_HALF_WIDTH + 0.05 + margin && lz >= 0 && lz < 3.15 + margin;
  const chimney = lx > HOUSE.halfWidth - margin && lx < HOUSE.halfWidth + 0.85 + margin && lz > -4.4 - margin && lz < -3.0 + margin;
  return body || porch || steps || chimney;
}

// ---------------------------------------------------------------------------
// Brushstrokes

/** Tree placements (design space): [x, z, size, kind, distance] with kind 0 broadleaf, 1 conifer, 2 birch. */
function treePlacements(): [number, number, number, number, number][] {
  const random = createRandom(LANDING_SEED ^ 0x7ee);
  const trees: [number, number, number, number, number][] = [
    // Framing trees in the foreground corners.
    [13.5, 9.5, 1.4, 1, 0],
    // Close companions of the house.
    [-6.4, -12.5, 1.25, 2, 0],
    [-6.2, -10.5, 1.1, 0, 0],
    [8.6, 1.5, 1.35, 1, 0],
    [9.8, -3.5, 1.45, 0, 0],
  ];
  // Distant forest closing the view beyond the clearing: big, loose strokes.
  for (let z = -34; z > -86; z -= 4.2 + random() * 3) {
    for (let x = -30; x < 80; x += 4.2 + random() * 3) {
      const px = x + (random() - 0.5) * 2;
      const pz = z + (random() - 0.5) * 2;
      if (designLakeDepth(px, pz) > -2.5) continue;
      trees.push([px, pz, 1.3 + random() * 0.7, random() < 0.55 ? 1 : 0, 1]);
    }
  }
  // The forest: denser to the right and behind the house, never on the lake.
  for (let z = 8; z > -33; z -= 2.6 + random() * 1.6) {
    for (let x = -14; x < 36; x += 2.8 + random() * 2.2) {
      const px = x + (random() - 0.5) * 1.6;
      const pz = z + (random() - 0.5) * 1.6;
      if (designLakeDepth(px, pz) > -2.2) continue;
      if (insideHouse(px, pz, 2.4)) continue;
      // Keep the clearing in front of the house and the view to its right side open.
      const [lx, , lz] = designToHouse([px, 0, pz]);
      if (lz > -1 && px < 8.2) continue;
      if (lx > 3 && lz > -8 && px < 8) continue;
      const roll = random();
      const kind = roll < 0.45 ? 1 : roll < 0.58 ? 2 : 0;
      trees.push([px, pz, (0.95 + random() * 0.6) * (pz < -14 ? 1.2 : 1), kind, pz < -14 ? 0.5 : 0]);
    }
  }
  return trees;
}

/** A rounded flowering shrub of foliage dabs with blossom heads on top. */
function shrub(strokes: Stroke[], random: () => number, x: number, z: number, radius: number, blossoms: readonly Vec3[] | null): void {
  const ground = designGround(x, z);
  const count = Math.round(260 * radius * radius);
  for (let i = 0; i < count; i += 1) {
    const u = random() * 1.2 - 0.2;
    const phi = random() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const dir: Vec3 = [s * Math.cos(phi), u, s * Math.sin(phi)];
    const point: Vec3 = [x + dir[0] * radius, ground + radius * 0.55 + dir[1] * radius * 0.75, z + dir[2] * radius];
    const normal = normalize([dir[0], dir[1] + 0.3, dir[2]]);
    const shade = 0.55 + 0.45 * Math.max(0, u + 0.2);
    strokes.push({
      kind: STROKE_KIND.foliage,
      origin: point,
      axis: [(random() - 0.5) * 0.25, -0.12 - random() * 0.1, (random() - 0.5) * 0.25],
      width: 0.13 + random() * 0.08,
      bend: (random() - 0.5) * 0.6,
      seed: random(),
      normal,
      color: jitterColor(scaleColor(pick(FOLIAGE, random), shade), random, 0.14),
      extra: 0.2,
    });
  }
  if (!blossoms) return;
  const heads = Math.round(9 * radius * radius + 3);
  for (let h = 0; h < heads; h += 1) {
    const u = 0.15 + random() * 0.8;
    const phi = random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const center: Vec3 = [x + s * Math.cos(phi) * radius * 0.95, ground + radius * 0.55 + u * radius * 0.8, z + s * Math.sin(phi) * radius * 0.95];
    const color = pick(blossoms, random);
    for (let p = 0; p < 14; p += 1) {
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 0.17;
      strokes.push({
        kind: STROKE_KIND.petal,
        origin: [center[0] + Math.cos(a) * r, center[1] + (random() - 0.3) * 0.12, center[2] + Math.sin(a) * r],
        axis: [Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05],
        width: 0.06,
        bend: (random() - 0.5) * 0.4,
        seed: random(),
        normal: [0, 0.6, 0.8],
        color: jitterColor(color, random, 0.12),
        extra: 0.05,
      });
    }
  }
}

function scaleColor(c: Vec3, s: number): Vec3 {
  return [c[0] * s, c[1] * s, c[2] * s];
}

/** A fern: arching fronds of small leaf dabs. */
function fern(strokes: Stroke[], random: () => number, x: number, z: number, size: number): void {
  const ground = designGround(x, z);
  const fronds = 6 + Math.floor(random() * 5);
  for (let f = 0; f < fronds; f += 1) {
    const a = (f / fronds) * Math.PI * 2 + random() * 0.5;
    const length = size * (0.6 + random() * 0.5);
    const color = pick(FERN, random);
    for (let i = 0; i < 7; i += 1) {
      const t = i / 7;
      const r = length * t;
      const y = ground + Math.sin(t * Math.PI * 0.8) * length * 0.45;
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [x + Math.cos(a) * r, y, z + Math.sin(a) * r],
        axis: [Math.cos(a + 1.2) * size * 0.12 * (1 - t * 0.6), -0.02, Math.sin(a + 1.2) * size * 0.12 * (1 - t * 0.6)],
        width: 0.05 * size,
        bend: 0.2,
        seed: random(),
        normal: [0, 0.8, 0.6],
        color: jitterColor(color, random, 0.12),
        extra: 0.1,
      });
    }
  }
}

/**
 * Trees, shrubs and reeds of the landing: everything tall enough to cast
 * shadows. Painted with the world's shared brush.
 */
export function buildLandingCasterStrokes(): Stroke[] {
  const random = createRandom(LANDING_SEED ^ 0xca5);
  const strokes: Stroke[] = [];
  const ground = designGround;
  for (const [x, z, size, kind, distance] of treePlacements()) {
    // Far trees are painted with fewer, bigger strokes.
    const far = 1 + distance * 2;
    const sparse = 1 + distance * distance * 4;
    if (kind === 1) {
      conifer(strokes, random, { x, z, size: size * 1.15, brush: 0.55 * far, density: (distance > 0 ? 2.4 : 4.2) / sparse, ground });
    } else if (kind === 2) {
      // Birch: pale trunk, light airy crown.
      const before = strokes.length;
      deciduousTree(strokes, random, { x, z, size: size * 0.85, widthScale: 0.6, heightScale: 1.5, brush: 0.5, density: 2.6, ground });
      for (let i = before; i < strokes.length; i += 1) {
        const stroke = strokes[i]!;
        if (stroke.kind === STROKE_KIND.trunk) strokes[i] = { ...stroke, color: jitterColor(pick(BIRCH, random), random, 0.08) };
      }
    } else {
      deciduousTree(strokes, random, {
        x,
        z,
        size,
        widthScale: 0.85 + random() * 0.4,
        heightScale: 0.9 + random() * 0.5,
        brush: 0.5 * far,
        density: 3.4 / sparse,
        ground,
      });
    }
  }

  // Hydrangeas along the porch and the house corners.
  const shrubSpots: [number, number, number][] = [
    [-3.75, 0.9, 0.62],
    [-2.2, 2.75, 0.45],
    [2.2, 2.75, 0.45],
    [3.7, 1.0, 0.65],
    [4.4, -1.4, 0.5],
    [-4.45, -1.6, 0.48],
  ];
  for (const [lx, lz, radius] of shrubSpots) {
    const p = houseToDesign([lx, 0, lz]);
    shrub(strokes, random, p[0], p[2], radius, HYDRANGEA);
  }
  // Wild shrubs at the forest edge.
  for (let i = 0; i < 26; i += 1) {
    const x = 5 + random() * 20;
    const z = 8 - random() * 30;
    const [lx, , lz] = designToHouse([x, 0, z]);
    if (insideHouse(x, z, 1) || (lz > -1 && x < 8.5) || (lx > 3 && lz > -8 && x < 7)) continue;
    shrub(strokes, random, x, z, 0.5 + random() * 0.6, random() < 0.3 ? WILDFLOWERS : null);
  }

  // Reeds along the lakeshore.
  for (let z = 16; z > -30; z -= 0.1 + random() * 0.22) {
    const clump = field(z * 3, 2, 4.4);
    if (clump < 0.4) continue;
    const x = landingShoreX(z) + (random() - 0.35) * 1.2;
    const g = Math.max(ground(x, z), LANDING_WATER_LEVEL - 0.05);
    const height = (0.6 + random() * 1.0) * (0.6 + clump * 0.7);
    strokes.push({
      kind: STROKE_KIND.blade,
      origin: [x, g - 0.05, z],
      axis: scaleColor(normalize([(random() - 0.5) * 0.4, 1, (random() - 0.5) * 0.3]), height),
      width: 0.035 + random() * 0.03,
      bend: (random() - 0.5) * 0.5,
      seed: random(),
      normal: normalize([0.6, 0.6, 0.5]),
      color: jitterColor(pick(REEDS, random), random, 0.14),
      extra: 0.15,
    });
  }
  return strokes.map(strokeToWorld);
}

/** A design-space stroke turned into world space. */
function strokeToWorld(stroke: Stroke): Stroke {
  return { ...stroke, origin: designToWorld(stroke.origin), axis: designToWorld(stroke.axis), normal: designToWorld(stroke.normal) };
}

/**
 * Low cover of the clearing: grass, wildflowers, ferns, moss around the
 * stepping stones and geraniums in the window boxes. Receives shadows only.
 */
export function buildLandingFieldStrokes(): Stroke[] {
  const random = createRandom(LANDING_SEED ^ 0xf1e);
  const strokes: Stroke[] = [];
  const path = pathPoints();
  const camera: Vec3 = LANDING_HOME_DESIGN.eye;
  for (let z = 30; z > -26; ) {
    const d0 = Math.max(0.8, Math.abs(camera[2] - z));
    const spacing = 0.04 + 0.02 * d0;
    for (let x = -14 + random() * spacing; x < 30; x += spacing * (0.7 + random() * 0.6)) {
      const px = x + (random() - 0.5) * spacing;
      const pz = z + (random() - 0.5) * spacing;
      const lake = designLakeDepth(px, pz);
      if (lake > -0.2) continue;
      if (insideHouse(px, pz, 0.05)) continue;
      const pathDistance = distanceToPath(px, pz, path);
      if (pathDistance < 0.32) continue;
      const lz = designToHouse([px, 0, pz])[2];
      // Mown near the porch and the path, long toward the forest and the water.
      const shore = smoothstep(-2.6, -0.4, lake);
      const forest = smoothstep(6, 11, px) + smoothstep(-6, -12, lz);
      const patches = (field(px * 1.2, pz * 1.2, 3.3) - 0.55) * 2.5;
      const wild = Math.min(1, Math.max(0, patches, shore, forest, smoothstep(camera[2] - 10.5, camera[2] - 7.5, pz)) * smoothstep(0.3, 1.3, pathDistance));
      // The mown lawn is left to the painted ground; strands grow where it runs wild.
      if (wild < 0.3 || random() > wild) continue;
      const height = wild > 0.5 ? (0.22 + random() * 0.42) * (pz > camera[2] - 5 ? 1.4 : 1) : 0.06 + random() * 0.08 + wild * 0.14;
      const axis = scaleColor(normalize([(random() - 0.5) * 0.6, 1, (random() - 0.5) * 0.45]), height);
      const g = designGround(px, pz);
      const sunTip = wild > 0.5 && random() < 0.2;
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [px, g - 0.02, pz],
        axis,
        width: 0.012 + 0.0042 * d0 + random() * 0.006,
        bend: (random() - 0.5) * 0.7,
        seed: random(),
        normal: normalize([0, 0.7, 0.7]),
        color: jitterColor(pick(sunTip ? GOLDEN_TIPS : BLADES, random), random, 0.08),
        extra: 0.1 + random() * 0.15,
      });
      if (wild > 0.45 && random() < 0.045 && lz > -7) {
        const tip: Vec3 = [px + axis[0], g + axis[1], pz + axis[2]];
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

  // Ferns under the trees at the clearing's edge.
  for (let i = 0; i < 60; i += 1) {
    const x = 5 + random() * 16;
    const z = 9 - random() * 26;
    const [lx, , lz] = designToHouse([x, 0, z]);
    if (insideHouse(x, z, 0.6) || (lz > -1 && x < 7.5) || (lx > 3 && lz > -8 && x < 6.5)) continue;
    fern(strokes, random, x, z, 0.5 + random() * 0.45);
  }

  // Geraniums spilling from the window boxes.
  for (const w of FRONT_WINDOWS) {
    for (let i = 0; i < 70; i += 1) {
      const lx = w.x0 + random() * (w.x1 - w.x0);
      const lz = 0.08 + random() * 0.24;
      const base = houseToDesign([lx, w.y0 - 0.15, lz]);
      const leaf = random() < 0.45;
      const trailing = random() < 0.25;
      const up = trailing ? -0.12 - random() * 0.16 : 0.06 + random() * 0.16;
      const out = houseToDesign([0, 0, 1]);
      strokes.push({
        kind: leaf ? STROKE_KIND.foliage : STROKE_KIND.petal,
        origin: [base[0], base[1] + (trailing ? -0.05 : 0.02), base[2]],
        axis: [out[0] * 0.08 + (random() - 0.5) * 0.06, up, out[2] * 0.08 + (random() - 0.5) * 0.06],
        width: leaf ? 0.08 : 0.06,
        bend: (random() - 0.5) * 0.5,
        seed: random(),
        normal: normalize([out[0], 0.7, out[2]]),
        color: jitterColor(leaf ? pick(FOLIAGE, random) : pick(GERANIUM, random), random, 0.12),
        extra: 0.08,
      });
    }
  }

  // Moss tufts and violets tucked between the stepping stones.
  for (const [x, z] of path) {
    for (let i = 0; i < 10; i += 1) {
      const a = random() * Math.PI * 2;
      const r = 0.34 + random() * 0.2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      if (insideHouse(px, pz)) continue;
      const g = designGround(px, pz);
      strokes.push({
        kind: STROKE_KIND.blade,
        origin: [px, g - 0.02, pz],
        axis: [Math.cos(a) * 0.04, 0.07 + random() * 0.06, Math.sin(a) * 0.04],
        width: 0.03,
        bend: (random() - 0.5) * 0.6,
        seed: random(),
        normal: [0, 0.7, 0.7],
        color: jitterColor(pick(BLADES, random), random, 0.1),
        extra: 0.1,
      });
    }
  }
  return strokes.map(strokeToWorld);
}

// ---------------------------------------------------------------------------
// Camera and the walk-through

/** Where the viewer stands at the clearing's edge, looking at the house front (design space). */
const LANDING_HOME_DESIGN: JourneyPose = { eye: [1.7, 1.75, 19.5], look: [-2.3, 2.7, -1.5] };
export const LANDING_HOME: JourneyPose = { eye: designToWorld(LANDING_HOME_DESIGN.eye), look: designToWorld(LANDING_HOME_DESIGN.look) };

/**
 * Home pose for a viewport: narrower (portrait) screens step back along the
 * view so the whole house front stays in frame.
 */
export function landingHomePose(aspect: number): JourneyPose {
  const back = Math.max(0, 1 - Math.min(Math.max(aspect, 0.3), 1)) * 9;
  const { eye, look } = LANDING_HOME;
  const dir = normalize([eye[0] - look[0], 0, eye[2] - look[2]]);
  return {
    eye: [eye[0] + dir[0] * back, eye[1] + back * 0.06, eye[2] + dir[2] * back],
    look: [look[0], look[1] - back * 0.05, look[2]],
  };
}

/** Length of the walk-through, in seconds. */
export const WALK_SECONDS = 4.8;

export interface WalkFrame {
  readonly eye: Vec3;
  readonly look: Vec3;
  /** Door swing 0 (closed) .. 1 (fully open). */
  readonly door: number;
  /** Warm light spilling from the doorway 0..1. */
  readonly spill: number;
  /** Fade into warm light at the end, 0..1. */
  readonly fade: number;
  readonly done: boolean;
}

function ease(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function easeOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - (1 - c) ** 3;
}

/** Cubic Hermite between `a` and `b` with end velocities `va`, `vb` (per unit of `u`). */
function hermite(a: Vec3, b: Vec3, va: Vec3, vb: Vec3, u: number): Vec3 {
  const c = Math.min(1, Math.max(0, u));
  const c2 = c * c;
  const c3 = c2 * c;
  const h00 = 2 * c3 - 3 * c2 + 1;
  const h10 = c3 - 2 * c2 + c;
  const h01 = -2 * c3 + 3 * c2;
  const h11 = c3 - c2;
  const at = (i: 0 | 1 | 2) => h00 * a[i] + h10 * va[i] + h01 * b[i] + h11 * vb[i];
  return [at(0), at(1), at(2)];
}

function scaleVec(v: Vec3, k: number): Vec3 {
  return [v[0] * k, v[1] * k, v[2] * k];
}

function subVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** When the walk reaches the porch steps, and when it comes to rest inside, in seconds. */
const WALK_STEPS_AT = 2.8;
const WALK_INSIDE_AT = WALK_SECONDS;
/** Pace at the steps as a share of the push's average pace: it slows at the door but never stops. */
const WALK_STEPS_PACE = 1;

/**
 * Two eased segments, home → the steps → inside, joined with a shared
 * velocity so the pace never jumps: starting from rest, slowing (without
 * stopping) at the door, then easing to rest inside, well under the light.
 */
function walkPath(t: number, home: Vec3, steps: Vec3, inside: Vec3): Vec3 {
  const push = WALK_INSIDE_AT - WALK_STEPS_AT;
  // Velocity at the steps (world units per second), straight along the doorway.
  const atSteps = scaleVec(subVec(inside, steps), WALK_STEPS_PACE / push);
  if (t <= WALK_STEPS_AT) return hermite(home, steps, [0, 0, 0], scaleVec(atSteps, WALK_STEPS_AT), t / WALK_STEPS_AT);
  return hermite(steps, inside, scaleVec(atSteps, push), [0, 0, 0], (t - WALK_STEPS_AT) / push);
}

/**
 * The walk-through at `seconds` after a member taps the door: walk up the
 * path to the steps, the door swings inward and warm light spills out, then
 * the camera climbs onto the porch and pushes through the doorway into the
 * light. The pace eases in and out with no sudden changes of speed (#204).
 */
export function walkThroughAt(seconds: number, home: JourneyPose = LANDING_HOME): WalkFrame {
  const t = Number.isFinite(seconds) ? Math.min(WALK_SECONDS, Math.max(0, seconds)) : 0;
  const door = easeOut((t - 1.5) / 1.3);
  const fade = ease((t - 3.4) / 1.2);
  const n = FRONT_NORMAL;
  const doorway = houseToWorld([0, 0, 0]);
  const atSteps: Vec3 = [doorway[0] + n[0] * 3.9, 1.75, doorway[2] + n[2] * 3.9];
  const inside: Vec3 = [doorway[0] - n[0] * 2.2, HOUSE.floor + 1.5, doorway[2] - n[2] * 2.2];
  const lookDoor: Vec3 = [doorway[0] - n[0] * 3, 1.75, doorway[2] - n[2] * 3];
  const lookDeep: Vec3 = [doorway[0] - n[0] * 8, HOUSE.floor + 1.45, doorway[2] - n[2] * 8];
  const eye = walkPath(t, home.eye, atSteps, inside);
  const look = walkPath(t, home.look, lookDoor, lookDeep);
  const push = ease((t - WALK_STEPS_AT) / (WALK_INSIDE_AT - WALK_STEPS_AT));
  return { eye, look, door, spill: Math.max(door, push), fade, done: Number.isFinite(seconds) && seconds >= WALK_SECONDS };
}

/** Picks the door when the ray passes through it before anything closer is plausible. */
export function pickDoor(ray: Ray): number | null {
  const hit = rayHitsDoor(ray);
  if (hit === null) return null;
  // Posts stand in front of the doorway only at the porch's corners; ignore rays that clip a post first.
  for (const x of [-INNER_POST, INNER_POST]) {
    const post = houseToWorld([x, HOUSE.floor, HOUSE.porchDepth - 0.17]);
    const blocked = rayHitsUprightCapsule(ray, post, 2.4, 0.06);
    if (blocked !== null && blocked < hit) return null;
  }
  return hit;
}
