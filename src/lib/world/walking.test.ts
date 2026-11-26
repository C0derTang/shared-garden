import { describe, expect, it } from "vitest";
import { createWalk, gardenWalkObstacles, groundTarget, walkable, walkingBounds, walkingPose } from "./walking";
import { gardenFovY } from "./garden-camera";
import fixture from "../../../scripts/profiling/fixtures/type-area-garden.json";
import { parseGardenState } from "../garden-v2/model";
import { typeAreaLayout } from "../garden-v2/type-areas";
import { gardenViewProjection } from "./garden-camera";
import { pickOnScreen, plotFootprints } from "./picking";
import { terrainHeight } from "./layout";

const bounds = { minX: -25, maxX: 25, maxZ: 45 };
describe("free garden walking", () => {
  it("moves the same distance at 30, 60 and 144Hz, including diagonals", () => {
    const positions = [30, 60, 144].map((hz) => {
      const walk = createWalk([0, 30], bounds, []);
      walk.press("right", "d"); walk.press("forward", "w");
      for (let frame = 0; frame < hz; frame++) walk.tick(1 / hz);
      return walk.position;
    });
    for (const p of positions) { expect(Math.hypot(p[0], p[1] - 30)).toBeCloseTo(4, 8); expect(p[0]).toBeCloseTo(2.8284271247, 8); }
  });
  it("stops on release, interruption and target cancellation; opposed keys cancel", () => {
    const walk = createWalk([0, 30], bounds, []);
    walk.press("right", "d"); walk.press("left", "a"); walk.tick(1);
    expect(walk.position).toEqual([0, 30]);
    walk.release("a"); walk.tick(1); expect(walk.position).toEqual([4, 30]);
    walk.release("d"); walk.tick(1); expect(walk.position).toEqual([4, 30]);
    walk.walkTo([10, 30]); walk.tick(0.5); expect(walk.position).toEqual([6, 30]);
    walk.stop(); walk.tick(1); expect(walk.position).toEqual([6, 30]);
    walk.walkTo([9, 30]); walk.press("left", "a"); walk.tick(0.5); expect(walk.position).toEqual([4, 30]);
  });
  it("sweeps large deltas without tunneling through a solid rock", () => {
    const walk = createWalk([-5, 20], bounds, [{ x: 0, z: 20, radius: 1 }]);
    walk.moveBy(10, 0);
    expect(walk.position[0]).toBeLessThan(-1); expect(walk.position[0]).toBeGreaterThan(-1.1);
  });
  it("rejects lake/outside targets and constrains continuous movement", () => {
    const walk = createWalk([0, 10], bounds, []);
    expect(walk.walkTo([0, -30])).toBe(false);
    expect(walk.walkTo([100, 10])).toBe(false);
    walk.moveBy(1000, -1000);
    expect(walk.position[0]).toBeLessThanOrEqual(25);
    expect(walk.position[1]).toBeGreaterThan(-7);
    walk.moveBy(0, 10000); expect(walk.position[1]).toBeLessThanOrEqual(45);
  });
  it("finishes a ground destination without overshoot", () => {
    const walk = createWalk([0, 30], bounds, []);
    walk.walkTo([1, 30]); walk.tick(1); walk.tick(1);
    expect(walk.position).toEqual([1, 30]);
  });
  it("opens all used expansion depth and outer area margins", () => {
    const reach = walkingBounds([{ center: [-19.8, 0, 7.4], radius: 1.3 }, { center: [19.8, 0, 3107.4], radius: 1.3 }], 3107.4);
    expect(reach.minX).toBeLessThan(-21); expect(reach.maxX).toBeGreaterThan(21); expect(reach.maxZ).toBeGreaterThan(3115);
  });
  it("walks valid approaches to every flower and all thirteen expanded areas at desktop and phone sizes", () => {
    const state = parseGardenState(structuredClone(fixture));
    // A distant expansion exercises the same immutable address mapping.
    state.plants.push({ ...state.plants[0]!, flower: { ...state.plants[0]!.flower, id: "distant-rose", spot: 1201 } });
    const layout = typeAreaLayout(state), obstacles = gardenWalkObstacles();
    const bounds = walkingBounds(layout.beds, layout.maxZ);
    const empty = layout.areas.map((area) => area.target);
    const flowers = layout.spots.filter((spot) => spot.spot > 0).map((spot) => ({ id: `flower-${spot.spot}`, position: spot.position, height: 1.1, radius: 0.32 }));
    for (const spot of layout.spots) {
      const start: [number, number] = [0, layout.maxZ + 9.5];
      const walk = createWalk(start, bounds, obstacles);
      const approach: [number, number] = [spot.position[0], spot.position[2] + 9];
      expect(walkable(approach, bounds, obstacles)).toBe(true);
      walk.moveBy(approach[0], 0); walk.moveBy(0, approach[1] - start[1]);
      expect(walk.position[0]).toBeCloseTo(approach[0]); expect(walk.position[1]).toBeCloseTo(approach[1]);
      for (const [width, height] of [[1280, 800], [390, 844]]) {
        const view = { width: width!, height: height!, viewProjection: gardenViewProjection(width!, height!, walkingPose(walk.position, width! / height!, gardenFovY(width! / height!))) };
        const footprint = plotFootprints(view, empty, flowers).find((plot) => spot.spot < 0 ? plot.target.kind === "spot" && plot.target.spot === spot.spot : plot.target.kind === "flower" && plot.target.id === `flower-${spot.spot}`)!;
        const head = footprint.parts.at(-1)!;
        const x = (head.a[0] + head.b[0]) / 2, y = (head.a[1] + head.b[1]) / 2;
        expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(width!);
        expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(height!);
        expect(pickOnScreen(view, x, y, empty, flowers)).toMatchObject(footprint.target);
      }
    }
  });
  it("casts only forward rays onto actual terrain", () => {
    expect(groundTarget({ origin: [0, 3, 20], direction: [0, 1, 0] }, bounds, [])).toBeNull();
    expect(groundTarget({ origin: [0, 3, 20], direction: [0, -1, 0] }, bounds, [])).toEqual([0, 20]);
    expect(groundTarget({ origin: [0, 3, -20], direction: [0, -1, 0] }, bounds, [])).toBeNull();
  });
  it("keeps the walked return pose stable while close-up focus comes and goes", () => {
    const p: [number, number] = [12, 23];
    const before = walkingPose(p, 0.5, gardenFovY(0.5));
    const close = walkingPose(p, 0.5, gardenFovY(0.5), { position: [19.8, 0, 10], height: 1 }, 1);
    expect(close).not.toEqual(before);
    expect(walkingPose(p, 0.5, gardenFovY(0.5))).toEqual(before);
    expect(before.eye).toEqual([12, terrainHeight(12, 23) + 2.5, 23]);
  });
});
