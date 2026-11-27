/** One authoritative fictional site: shared by the house front and backyard. */
import { designToWorld } from "./landing-frame";
/** Height of the lake surface (same as the garden). */
export const LANDING_WATER_LEVEL = -0.35;

// The landing is laid out in a "design" space (see ./landing-frame).

/** Design x of the lakeshore at design depth z; the lake lies at smaller x (west). */
export function landingShoreX(z: number): number {
  return -7.6 + 0.9 * Math.sin(0.23 * z + 0.5) + 0.4 * Math.sin(0.61 * z - 1.2) - 0.3 * Math.max(0, z - 6) + 0.18 * Math.min(0, z + 12);
}

export function designLakeDepth(x: number, z: number): number {
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
export function designGround(x: number, z: number): number {
  const [wx, , wz] = designToWorld([x, 0, z]);
  return landingTerrainHeight(wx, wz);
}

/** Corners of the lake's water plane in world xz (it reaches around the viewer's left). */
export const LANDING_WATER_EXTENT = { minX: -34, maxX: 200, minZ: -260, maxZ: 260 } as const;

function smoothstep(edge0:number,edge1:number,x:number):number {const t=Math.min(1,Math.max(0,(x-edge0)/(edge1-edge0)));return t*t*(3-2*t);}
