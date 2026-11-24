import { describe, expect, it } from "vitest";
import { orthographic, projectToNdc, lookAt, multiply } from "./camera";
import { bedEdgingRocks, buildMountainMesh, buildRockMesh, mountainHeight, shoreRocks, valueNoise } from "./landforms";
import { BED_RADIUS, bedAt } from "./layout";

describe("landforms", () => {
  it("rings every open bed with edging stones", () => {
    const rocks = bedEdgingRocks(2);
    expect(rocks.length).toBeGreaterThan(40);
    for (const rock of rocks) {
      const distances = [0, 1].map((b) => Math.hypot(rock.x - bedAt(b).center[0], rock.z - bedAt(b).center[2]));
      expect(Math.min(...distances)).toBeCloseTo(BED_RADIUS + 0.04, 1);
    }
  });

  it("is deterministic", () => {
    expect(shoreRocks()).toEqual(shoreRocks());
    expect(buildRockMesh(shoreRocks()).vertices).toEqual(buildRockMesh(shoreRocks()).vertices);
  });

  it("builds valid rock and mountain meshes", () => {
    for (const mesh of [buildRockMesh(shoreRocks()), buildMountainMesh()]) {
      const vertexCount = mesh.vertices.length / mesh.stride;
      expect(Number.isInteger(vertexCount)).toBe(true);
      expect(mesh.indices.reduce((a, b) => Math.max(a, b), 0)).toBeLessThan(vertexCount);
      for (let i = 0; i < mesh.vertices.length; i += 1) expect(Number.isFinite(mesh.vertices[i])).toBe(true);
    }
  });

  it("raises mountains only far beyond the lake, taller toward the back", () => {
    expect(mountainHeight(0, -100)).toBe(0);
    let near = 0;
    let far = 0;
    for (let x = -300; x < 300; x += 5) {
      near = Math.max(near, mountainHeight(x, -185));
      far = Math.max(far, mountainHeight(x, -320));
    }
    expect(far).toBeGreaterThan(near);
    expect(far).toBeLessThan(80);
  });

  it("keeps value noise in range", () => {
    for (let i = 0; i < 200; i += 1) {
      const n = valueNoise(i * 0.37, i * 0.91);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("orthographic", () => {
  it("maps the light box into clip space with WebGPU depth", () => {
    const view = lookAt([0, 50, 0.001], [0, 0, 0]);
    const vp = multiply(orthographic(-10, 10, -10, 10, 1, 100), view);
    const centre = projectToNdc(vp, [0, 0, 0])!;
    expect(centre[0]).toBeCloseTo(0);
    expect(centre[1]).toBeCloseTo(0);
    expect(centre[2]).toBeGreaterThan(0);
    expect(centre[2]).toBeLessThan(1);
    expect(Math.abs(projectToNdc(vp, [9.9, 0, 0])![0])).toBeLessThan(1);
  });
});
