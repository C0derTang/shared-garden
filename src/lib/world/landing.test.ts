import { describe, expect, it } from "vitest";
import type { Ray } from "./camera";
import { terrainHeight } from "./layout";
import {
  DOOR_CAPTION,
  DOOR_HINGE,
  FRONT_NORMAL,
  HOUSE,
  HOUSE_MATERIAL,
  HOUSE_STRIDE,
  LANDING_HOME,
  LANDING_WATER_LEVEL,
  WALK_SECONDS,
  buildHouseMesh,
  buildLandingCasterStrokes,
  buildLandingFieldStrokes,
  buildLandingGroundMesh,
  designToWorld,
  houseToWorld,
  landingHomePose,
  landingLakeDepth,
  landingRocks,
  landingTerrainHeight,
  pickDoor,
  rayHitsDoor,
  walkThroughAt,
  worldToDesign,
  worldToHouse,
} from "./landing";
import type { Vec3 } from "./layout";

function rayTo(from: Vec3, to: Vec3): Ray {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const length = Math.hypot(...d);
  return { origin: from, direction: [d[0] / length, d[1] / length, d[2] / length] };
}

function close(a: Vec3, b: Vec3, epsilon = 1e-6) {
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i]!, -Math.log10(epsilon)));
}

describe("landing layout", () => {
  it("turns the design a quarter so the lake and the sunset lie west, to the viewer's left", () => {
    close(worldToDesign(designToWorld([1.5, 2, -3])), [1.5, 2, -3]);
    // Design forward (-z) is north (+x); design left (-x) is west (-z).
    close(designToWorld([0, 0, -1]), [1, 0, 0]);
    close(designToWorld([-1, 0, 0]), [0, 0, -1]);
  });

  it("keeps the house and clearing on land and opens the lake to the west", () => {
    expect(landingLakeDepth(0, 0)).toBeLessThan(-3);
    expect(landingLakeDepth(LANDING_HOME.eye[0], LANDING_HOME.eye[2])).toBeLessThan(-1.5);
    expect(landingLakeDepth(10, -30)).toBeGreaterThan(5);
    expect(landingTerrainHeight(10, -30)).toBeLessThan(LANDING_WATER_LEVEL);
    expect(landingTerrainHeight(0, 0)).toBeGreaterThan(LANDING_WATER_LEVEL + 0.2);
  });

  it("meets the garden's far western shore, so the shared far-shore trees stand on the ground", () => {
    for (const [x, z] of [
      [-40, -95],
      [20, -100],
      [60, -110],
    ] as const) {
      expect(Math.abs(landingTerrainHeight(x, z) - terrainHeight(x, z))).toBeLessThan(0.2);
    }
  });

  it("builds a finite ground heightfield", () => {
    const mesh = buildLandingGroundMesh();
    expect(mesh.vertices.length % mesh.stride).toBe(0);
    expect(mesh.vertices.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.every((index) => index < mesh.vertices.length / mesh.stride)).toBe(true);
  });
});

describe("the house", () => {
  const mesh = buildHouseMesh();
  const materials = new Set<number>();
  for (let i = HOUSE_STRIDE - 1; i < mesh.vertices.length; i += HOUSE_STRIDE) materials.add(mesh.vertices[i]!);

  it("is a finite indexed mesh using every house material", () => {
    expect(mesh.stride).toBe(HOUSE_STRIDE);
    expect(mesh.vertices.every(Number.isFinite)).toBe(true);
    expect(mesh.indices.length % 3).toBe(0);
    expect(Math.max(...mesh.indices)).toBeLessThan(mesh.vertices.length / HOUSE_STRIDE);
    expect([...materials].sort((a, b) => a - b)).toEqual(Object.values(HOUSE_MATERIAL).sort((a, b) => a - b));
  });

  it("faces the viewer, with the door hinged on the front wall", () => {
    expect(Math.hypot(...FRONT_NORMAL)).toBeCloseTo(1, 6);
    const toViewer = rayTo(houseToWorld([0, 0, 0]), LANDING_HOME.eye).direction;
    expect(FRONT_NORMAL[0] * toViewer[0] + FRONT_NORMAL[2] * toViewer[2]).toBeGreaterThan(0.8);
    close(worldToHouse(DOOR_HINGE), [HOUSE.door.minX, 0, HOUSE.door.z]);
    close(worldToHouse(houseToWorld([1, 2, 3])), [1, 2, 3]);
    // The floating words sit in front of the house, above the porch.
    expect(worldToHouse(DOOR_CAPTION)[2]).toBeGreaterThan(0);
  });

  it("picks the door from the viewer and nothing else", () => {
    const doorCenter = houseToWorld([0, 1.7, 0]);
    expect(rayHitsDoor(rayTo(LANDING_HOME.eye, doorCenter))).not.toBeNull();
    expect(pickDoor(rayTo(LANDING_HOME.eye, doorCenter))).not.toBeNull();
    expect(rayHitsDoor(rayTo(LANDING_HOME.eye, houseToWorld([-2.4, 2, 0])))).toBeNull();
    expect(rayHitsDoor(rayTo(LANDING_HOME.eye, [LANDING_HOME.eye[0] + 1, 40, LANDING_HOME.eye[2]]))).toBeNull();
    // A ray from inside the house, pointing away from the door, misses.
    expect(rayHitsDoor(rayTo(houseToWorld([0, 1.7, 1]), houseToWorld([0, 1.7, 5])))).toBeNull();
  });
});

describe("the walk-through", () => {
  it("starts at the viewer's pose with the door shut", () => {
    const start = walkThroughAt(0);
    close(start.eye, LANDING_HOME.eye);
    close(start.look, LANDING_HOME.look);
    expect(start).toMatchObject({ door: 0, spill: 0, fade: 0, done: false });
  });

  it("opens the door, pushes through into the house and fades into light", () => {
    let previousFade = 0;
    for (let t = 0; t <= WALK_SECONDS; t += 0.1) {
      const frame = walkThroughAt(t);
      expect(frame.fade).toBeGreaterThanOrEqual(previousFade);
      expect(frame.door).toBeGreaterThanOrEqual(0);
      expect(frame.door).toBeLessThanOrEqual(1);
      previousFade = frame.fade;
    }
    const middle = walkThroughAt(2.6);
    expect(middle.door).toBeGreaterThan(0.5);
    expect(middle.fade).toBe(0);
    const end = walkThroughAt(WALK_SECONDS);
    expect(end).toMatchObject({ door: 1, fade: 1, done: true });
    // The camera ends inside the house, behind the front wall.
    expect(worldToHouse(end.eye)[2]).toBeLessThan(-0.5);
    expect(walkThroughAt(Number.NaN).done).toBe(false);
  });

  it("paces the walk smoothly: easing in and out, slowing at the door but never stopping (#204)", () => {
    for (const home of [LANDING_HOME, landingHomePose(390 / 844)]) {
      const step = 1 / 60;
      let previous = walkThroughAt(0, home);
      let previousSpeed = 0;
      let slowestMidway = Number.POSITIVE_INFINITY;
      for (let t = step; t <= WALK_SECONDS + 1e-9; t += step) {
        const frame = walkThroughAt(t, home);
        const speed = Math.hypot(frame.eye[0] - previous.eye[0], frame.eye[1] - previous.eye[1], frame.eye[2] - previous.eye[2]) / step;
        // No sudden changes of pace from one frame to the next.
        expect(Math.abs(speed - previousSpeed)).toBeLessThan(0.25);
        if (t > 0.6 && t < WALK_SECONDS - 0.6) slowestMidway = Math.min(slowestMidway, speed);
        previous = frame;
        previousSpeed = speed;
      }
      // It keeps moving through the doorway (no pause at the steps) and comes to rest at the end.
      expect(slowestMidway).toBeGreaterThan(2.5);
      expect(previousSpeed).toBeLessThan(0.1);
    }
  });

  it("steps back on portrait screens so the house stays in frame", () => {
    const wide = landingHomePose(1.6);
    const tall = landingHomePose(390 / 844);
    close(wide.eye, LANDING_HOME.eye);
    const distance = (pose: typeof wide) => Math.hypot(pose.eye[0] - pose.look[0], pose.eye[2] - pose.look[2]);
    expect(distance(tall)).toBeGreaterThan(distance(wide) + 3);
  });
});

describe("landing brushstrokes and stones", () => {
  const casters = buildLandingCasterStrokes();
  const field = buildLandingFieldStrokes();

  it("is deterministic and finite", () => {
    expect(buildLandingCasterStrokes()).toHaveLength(casters.length);
    expect(buildLandingFieldStrokes()).toHaveLength(field.length);
    for (const stroke of [...casters, ...field]) {
      expect([...stroke.origin, ...stroke.axis, ...stroke.normal, ...stroke.color, stroke.width].every(Number.isFinite)).toBe(true);
    }
    // A painted forest, within a budget the GPU draws comfortably every frame.
    expect(casters.length).toBeGreaterThan(40_000);
    expect(casters.length + field.length).toBeLessThan(330_000);
  });

  it("grows no grass inside the house or out on the lake", () => {
    for (const stroke of field) {
      const [x, , z] = stroke.origin;
      const local = worldToHouse(stroke.origin);
      const insideBody = Math.abs(local[0]) < HOUSE.halfWidth - 0.2 && local[2] < -0.3 && local[2] > -HOUSE.depth + 0.3;
      expect(insideBody).toBe(false);
      expect(landingLakeDepth(x, z)).toBeLessThan(0.5);
    }
  });

  it("lays stepping stones and boulders on the ground", () => {
    const rocks = landingRocks();
    expect(rocks.length).toBeGreaterThan(14);
    for (const rock of rocks) {
      expect([rock.x, rock.z, rock.radius, rock.height].every(Number.isFinite)).toBe(true);
      expect(landingLakeDepth(rock.x, rock.z)).toBeLessThan(2.5);
    }
  });
});
