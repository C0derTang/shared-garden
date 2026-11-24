/**
 * Solid landforms of the painted world: stones (shore boulders, foreground
 * rocks, bed edging) and the distant mountain ranges across the lake. Pure
 * mesh data, no GPU calls.
 */

import { BED_RADIUS, bedAt, shorelineZ, terrainHeight, type Vec3 } from "./layout";
import type { MeshData } from "./scenery";
import { createRandom } from "./strokes";

/** Floats per rock vertex: position(3) normal(3) tone(2: seed, mossiness). */
export const ROCK_STRIDE = 8;
/** Floats per mountain vertex: position(3) normal(3). */
export const MOUNTAIN_STRIDE = 6;

export interface Rock {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly height: number;
  readonly seed: number;
  /** 0 bare .. 1 mossy top. */
  readonly moss: number;
}

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth value noise in [0, 1]. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/** Boulders along our shoreline and a few weathered stones framing the foreground. */
export function shoreRocks(): Rock[] {
  const random = createRandom(0x0c4e);
  const rocks: Rock[] = [];
  for (let x = -45; x < 45; x += 1.2 + random() * 2.4) {
    if (valueNoise(x * 0.18, 4.2) < 0.45) continue;
    const cluster = 1 + Math.floor(random() * 3);
    for (let i = 0; i < cluster; i += 1) {
      const rx = x + (random() - 0.5) * 1.4;
      const radius = 0.2 + random() * 0.6;
      rocks.push({ x: rx, z: shorelineZ(rx) + (random() - 0.35) * 1.1, radius, height: radius * (0.5 + random() * 0.4), seed: random(), moss: random() * 0.6 });
    }
  }
  for (const [x, z, radius] of [
    [-3.4, 13.7, 0.62],
    [-2.5, 14.5, 0.32],
    [3.1, 14.0, 0.48],
    [4.6, 12.9, 0.75],
    [-6.2, 12.2, 0.55],
  ] as const) {
    rocks.push({ x, z, radius, height: radius * 0.62, seed: random(), moss: 0.8 });
  }
  return rocks;
}

/** A ring of edging stones around each open bed. */
export function bedEdgingRocks(bedCount: number): Rock[] {
  const random = createRandom(0xbed5);
  const rocks: Rock[] = [];
  for (let b = 0; b < bedCount; b += 1) {
    const bed = bedAt(b);
    const ring = BED_RADIUS + 0.04;
    const count = Math.round((Math.PI * 2 * ring) / 0.3);
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + (random() - 0.5) * 0.08;
      const radius = 0.13 + random() * 0.06;
      rocks.push({
        x: bed.center[0] + Math.cos(a) * ring,
        z: bed.center[2] + Math.sin(a) * ring,
        radius,
        height: radius * (0.65 + random() * 0.3),
        seed: random(),
        moss: 0.4 + random() * 0.6,
      });
    }
  }
  return rocks;
}

/** Lumpy, flattened stones sunk into the ground. */
export function buildRockMesh(rocks: readonly Rock[]): MeshData {
  const around = 12;
  const down = 7;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const rock of rocks) {
    const first = vertices.length / ROCK_STRIDE;
    const ground = terrainHeight(rock.x, rock.z);
    const positions: Vec3[] = [];
    for (let j = 0; j <= down; j += 1) {
      const polar = (j / down) * Math.PI * 0.62;
      for (let i = 0; i <= around; i += 1) {
        const azimuth = (i / around) * Math.PI * 2;
        const dx = Math.sin(polar) * Math.cos(azimuth);
        const dz = Math.sin(polar) * Math.sin(azimuth);
        const dy = Math.cos(polar);
        const bump = 0.8 + 0.35 * valueNoise(dx * 1.7 + rock.seed * 40, dz * 1.7 + dy * 1.3 + rock.seed * 17);
        // Faceted: flatten the top a little.
        const top = j === 0 ? 0.92 : 1;
        positions.push([
          rock.x + dx * rock.radius * bump,
          ground - rock.height * 0.2 + dy * rock.height * bump * top,
          rock.z + dz * rock.radius * bump * 0.9,
        ]);
      }
    }
    const row = around + 1;
    const normals = positions.map(() => [0, 0, 0] as [number, number, number]);
    const local: number[] = [];
    for (let j = 0; j < down; j += 1) {
      for (let i = 0; i < around; i += 1) {
        const a = j * row + i;
        local.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
      }
    }
    for (let k = 0; k < local.length; k += 3) {
      const [ia, ib, ic] = [local[k]!, local[k + 1]!, local[k + 2]!];
      const pa = positions[ia]!;
      const pb = positions[ib]!;
      const pc = positions[ic]!;
      const u: Vec3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const v: Vec3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
      const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const index of [ia, ib, ic]) {
        const target = normals[index]!;
        target[0] += n[0];
        target[1] += n[1];
        target[2] += n[2];
      }
    }
    positions.forEach((p, index) => {
      const n = normals[index]!;
      // Weld the seam and the pole.
      if (index % row === around) {
        const seam = normals[index - around]!;
        n[0] += seam[0];
        n[1] += seam[1];
        n[2] += seam[2];
      }
      const length = Math.hypot(n[0], n[1], n[2]) || 1;
      let nx = n[0] / length;
      let ny = n[1] / length;
      let nz = n[2] / length;
      if (index < row) {
        nx = 0;
        ny = 1;
        nz = 0;
      }
      // Outward-facing normals (winding independent).
      const ox = p[0] - rock.x;
      const oz = p[2] - rock.z;
      if (nx * ox + ny * 0.2 + nz * oz < 0 && index >= row) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      vertices.push(p[0], p[1], p[2], nx, ny, nz, rock.seed, rock.moss);
    });
    for (const index of local) indices.push(first + index);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), stride: ROCK_STRIDE };
}

/** Height of the distant ranges: foothills in front, taller ridged peaks behind. */
export function mountainHeight(x: number, z: number): number {
  const depth = Math.min(1, Math.max(0, (-z - 170) / 150));
  let ridges = 0;
  let amplitude = 1;
  let frequency = 0.008;
  for (let octave = 0; octave < 5; octave += 1) {
    const n = valueNoise(x * frequency + octave * 7.3, z * frequency * 1.6 + octave * 3.1);
    ridges += (1 - Math.abs(n * 2 - 1)) * amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  const envelope = 8 + depth * 34;
  const rise = Math.min(1, Math.max(0, (-z - 160) / 18));
  return (ridges * envelope - 4) * rise;
}

/** Heightfield of mountains across the lake, beyond the far shore. */
export function buildMountainMesh(): MeshData {
  const minX = -520;
  const maxX = 520;
  const nearZ = -150;
  const farZ = -330;
  const columns = 220;
  const rows = 60;
  const vertices: number[] = [];
  const indices: number[] = [];
  for (let j = 0; j <= rows; j += 1) {
    const z = nearZ + ((farZ - nearZ) * j) / rows;
    for (let i = 0; i <= columns; i += 1) {
      const x = minX + ((maxX - minX) * i) / columns;
      const e = 1.5;
      const h = mountainHeight(x, z);
      const nx = -(mountainHeight(x + e, z) - mountainHeight(x - e, z)) / (2 * e);
      const nz = -(mountainHeight(x, z + e) - mountainHeight(x, z - e)) / (2 * e);
      const length = Math.hypot(nx, 1, nz);
      vertices.push(x, h, z, nx / length, 1 / length, nz / length);
    }
  }
  const row = columns + 1;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < columns; i += 1) {
      const a = j * row + i;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices), stride: MOUNTAIN_STRIDE };
}
