import { describe, expect, it } from "vitest";
import { bedAt, distanceToBeds, shorelineZ } from "./layout";
import { buildBedMesh, buildFarShoreStrokes, buildGroundMesh, buildMeadowStrokes, buildNearShoreStrokes } from "./scenery";
import { STROKE_FLOATS, STROKE_KIND, createRandom, packStrokes } from "./strokes";

describe("procedural scenery", () => {
  it("is deterministic", () => {
    expect(packStrokes(buildFarShoreStrokes())).toEqual(packStrokes(buildFarShoreStrokes()));
    expect(packStrokes(buildMeadowStrokes(2))).toEqual(packStrokes(buildMeadowStrokes(2)));
  });

  it("keeps grass out of open beds and paints soil inside them", () => {
    const beds = [bedAt(0), bedAt(1)];
    const strokes = buildMeadowStrokes(2);
    const blades = strokes.filter((s) => s.kind === STROKE_KIND.blade);
    const soil = strokes.filter((s) => s.kind === STROKE_KIND.surface);
    expect(blades.length).toBeGreaterThan(1000);
    expect(soil.length).toBeGreaterThan(200);
    for (const blade of blades) expect(distanceToBeds(blade.origin[0], blade.origin[2], beds)).toBeGreaterThan(0);
    for (const dab of soil) expect(distanceToBeds(dab.origin[0], dab.origin[2], beds)).toBeLessThan(0);
  });

  it("keeps meadow grass on dry land", () => {
    for (const s of buildMeadowStrokes(1)) {
      if (s.kind === STROKE_KIND.blade) expect(s.origin[2]).toBeGreaterThan(shorelineZ(s.origin[0]));
    }
  });

  it("puts the far shore across the lake", () => {
    for (const s of buildFarShoreStrokes()) expect(s.origin[2]).toBeLessThan(-70);
  });

  it("only produces finite, sized strokes", () => {
    for (const s of [...buildNearShoreStrokes(), ...buildMeadowStrokes(3)]) {
      expect(Number.isFinite(s.origin[0] + s.origin[1] + s.origin[2])).toBe(true);
      expect(Math.hypot(...s.axis)).toBeGreaterThan(0);
      expect(s.width).toBeGreaterThan(0);
    }
  });

  it("builds indexed meshes within range", () => {
    for (const mesh of [buildGroundMesh(), buildBedMesh(3)]) {
      const vertexCount = mesh.vertices.length / mesh.stride;
      expect(Number.isInteger(vertexCount)).toBe(true);
      expect(mesh.indices.reduce((a, b) => Math.max(a, b), 0)).toBeLessThan(vertexCount);
      expect(mesh.indices.length % 3).toBe(0);
    }
  });
});

describe("stroke packing", () => {
  it("packs the documented instance layout", () => {
    const data = packStrokes([
      { kind: STROKE_KIND.petal, origin: [1, 2, 3], axis: [4, 5, 6], width: 7, bend: 8, seed: 0.5, normal: [0, 1, 0], color: [0.1, 0.2, 0.3], extra: 0.9 },
    ]);
    expect(data).toHaveLength(STROKE_FLOATS);
    expect(Array.from(data)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0.5, STROKE_KIND.petal, 0, 1, 0, 0.1, 0.2, 0.3, 0.9].map((v) => Math.fround(v)));
  });

  it("seeds a reproducible random stream", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(a()).toBeGreaterThanOrEqual(0);
  });
});
