import { describe, expect, it } from "vitest";
import { invert, lookAt, multiply, perspective, projectToNdc, rayFromNdc, rayHitsUprightCapsule } from "./camera";
import { MIN_TARGET_PX, distanceToSegment, pickOnScreen, plotFootprints } from "./picking";

function camera() {
  const view = lookAt([0, 2, 10], [0, 0, 0]);
  const projection = perspective(Math.PI / 4, 16 / 9, 0.1, 100);
  const viewProjection = multiply(projection, view);
  return { viewProjection, inverse: invert(viewProjection)! };
}

describe("camera math", () => {
  it("projects the look target to the centre of the screen", () => {
    const { viewProjection } = camera();
    const ndc = projectToNdc(viewProjection, [0, 0, 0])!;
    expect(ndc[0]).toBeCloseTo(0);
    expect(ndc[1]).toBeCloseTo(0);
    expect(ndc[2]).toBeGreaterThan(0);
    expect(ndc[2]).toBeLessThan(1);
  });

  it("returns null for points behind the camera", () => {
    expect(projectToNdc(camera().viewProjection, [0, 2, 20])).toBeNull();
  });

  it("round-trips a projected point through a ray", () => {
    const { viewProjection, inverse } = camera();
    const point: [number, number, number] = [1.2, 0.3, -2];
    const ndc = projectToNdc(viewProjection, point)!;
    const ray = rayFromNdc(inverse, ndc[0], ndc[1]);
    const t = (point[2] - ray.origin[2]) / ray.direction[2];
    expect(ray.origin[0] + ray.direction[0] * t).toBeCloseTo(point[0], 4);
    expect(ray.origin[1] + ray.direction[1] * t).toBeCloseTo(point[1], 4);
  });
});

describe("ray picking (the landing's door)", () => {
  it("hits an upright capsule from the side", () => {
    const side = { origin: [-5, 0.5, 0] as [number, number, number], direction: [1, 0, 0] as [number, number, number] };
    expect(rayHitsUprightCapsule(side, [0, 0, 0], 1, 0.3)).toBeCloseTo(5, 0);
    expect(rayHitsUprightCapsule(side, [0, 0, 2], 1, 0.3)).toBeNull();
  });
});

describe("picking on screen", () => {
  // A camera looking straight down -z from (0, 0.5, 10) onto an 800 × 600 canvas.
  const viewProjection = multiply(perspective(Math.PI / 4, 800 / 600, 0.1, 100), lookAt([0, 0.5, 10], [0, 0.5, 0]));
  const view = { viewProjection, width: 800, height: 600 };
  const at = (p: [number, number, number]) => {
    const ndc = projectToNdc(viewProjection, p)!;
    return [((ndc[0] + 1) / 2) * 800, ((1 - ndc[1]) / 2) * 600] as const;
  };

  it("measures distance to a segment", () => {
    expect(distanceToSegment(5, 5, [0, 0], [10, 0])).toBeCloseTo(5);
    expect(distanceToSegment(-3, 4, [0, 0], [10, 0])).toBeCloseTo(5);
    expect(distanceToSegment(3, 4, [0, 0], [0, 0])).toBeCloseTo(5);
  });

  it("gives a tiny sprout the minimum target and nothing beyond it", () => {
    const sprout = [{ id: "sprout", position: [0, 0, 0] as [number, number, number], height: 0.08, radius: 0.04 }];
    const [x, y] = at([0, 0.04, 0]);
    expect(pickOnScreen(view, x, y, [], sprout)).toMatchObject({ kind: "flower", id: "sprout" });
    expect(pickOnScreen(view, x + MIN_TARGET_PX / 2 - 2, y, [], sprout)).toMatchObject({ kind: "flower", id: "sprout" });
    expect(pickOnScreen(view, x, y - MIN_TARGET_PX / 2 + 2, [], sprout)).toMatchObject({ kind: "flower", id: "sprout" });
    expect(pickOnScreen(view, x + MIN_TARGET_PX, y, [], sprout)).toBeNull();
  });

  it("answers anywhere on a bloom's head, wider than the minimum target", () => {
    const bloom = [{ id: "bloom", position: [0, 0, 0] as [number, number, number], height: 1, radius: 0.4 }];
    const [hx, hy] = at([0.36, 0.75, 0]);
    expect(pickOnScreen(view, hx, hy, [], bloom)).toMatchObject({ kind: "flower", id: "bloom" });
    const [cx] = at([0, 0.75, 0]);
    expect(hx - cx).toBeGreaterThan(MIN_TARGET_PX / 2);
  });

  it("resolves overlapping targets to the plot whose spine is nearest the pointer", () => {
    const flowers = [
      { id: "bloom", position: [0, 0, 0] as [number, number, number], height: 1, radius: 0.4 },
      { id: "sprout", position: [0.3, 0, 0] as [number, number, number], height: 0.08, radius: 0.04 },
    ];
    // On the sprout, inside the bloom's leaves: still the sprout.
    const [sx, sy] = at([0.3, 0.04, 0]);
    expect(pickOnScreen(view, sx, sy, [], flowers)).toMatchObject({ id: "sprout" });
    // On the bloom's stalk: the bloom.
    const [bx, by] = at([0, 0.3, 0]);
    expect(pickOnScreen(view, bx, by, [], flowers)).toMatchObject({ id: "bloom" });
  });

  it("picks an empty spot's seed mark and prefers the nearer of two plots", () => {
    const spots = [
      { spot: 2, position: [-0.5, 0, 0] as [number, number, number] },
      { spot: 3, position: [0.5, 0, 0] as [number, number, number] },
    ];
    const [x2, y2] = at([-0.5, 0.1, 0]);
    expect(pickOnScreen(view, x2, y2, spots, [])).toMatchObject({ kind: "spot", spot: 2 });
    const [x3, y3] = at([0.5, 0.1, 0]);
    expect(pickOnScreen(view, x3 - 3, y3, spots, [])).toMatchObject({ kind: "spot", spot: 3 });
    expect(pickOnScreen(view, 10, 10, spots, [])).toBeNull();
  });

  it("lists footprints only for plots in front of the camera", () => {
    const behind = [{ spot: 9, position: [0, 0, 20] as [number, number, number] }];
    expect(plotFootprints(view, behind, [])).toEqual([]);
  });
});
