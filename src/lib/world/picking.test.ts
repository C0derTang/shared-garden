import { describe, expect, it } from "vitest";
import { invert, lookAt, multiply, perspective, projectToNdc, rayFromNdc, rayHitsUprightCapsule } from "./camera";
import { pickAlongRay, rayHitsGroundDisc } from "./picking";

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

describe("picking", () => {
  const down = { origin: [0, 5, 0] as [number, number, number], direction: [0, -1, 0] as [number, number, number] };

  it("hits a ground disc under the ray", () => {
    expect(rayHitsGroundDisc(down, [0.1, 0, 0], 0.3)).toBeCloseTo(5);
    expect(rayHitsGroundDisc(down, [1, 0, 0], 0.3)).toBeNull();
  });

  it("hits an upright capsule from the side", () => {
    const side = { origin: [-5, 0.5, 0] as [number, number, number], direction: [1, 0, 0] as [number, number, number] };
    expect(rayHitsUprightCapsule(side, [0, 0, 0], 1, 0.3)).toBeCloseTo(5, 0);
    expect(rayHitsUprightCapsule(side, [0, 0, 2], 1, 0.3)).toBeNull();
  });

  it("prefers a flower standing in front of an empty spot", () => {
    const ray = { origin: [0, 0.5, 5] as [number, number, number], direction: [0, -0.1, -1] as [number, number, number] };
    const len = Math.hypot(...ray.direction);
    const r = { origin: ray.origin, direction: ray.direction.map((v) => v / len) as [number, number, number] };
    const result = pickAlongRay(r, [{ spot: 3, position: [0, 0, 0] }], [{ id: "rose", position: [0, 0, 1] }]);
    expect(result).toMatchObject({ kind: "flower", id: "rose" });
  });

  it("picks an empty spot and returns null on a miss", () => {
    expect(pickAlongRay(down, [{ spot: 7, position: [0, 0, 0] }], [])).toMatchObject({ kind: "spot", spot: 7 });
    expect(pickAlongRay(down, [{ spot: 7, position: [3, 0, 0] }], [])).toBeNull();
  });
});
