import { describe, expect, it } from "vitest";
import { blendPoses, focusPose, journeyPose } from "./journey";
import { CAMERA_HOME } from "./layout";

describe("journeyPose", () => {
  it("starts at the camera's home and walks forward", () => {
    expect(journeyPose(0).eye).toEqual(CAMERA_HOME);
    expect(journeyPose(1).eye[2]).toBeLessThan(CAMERA_HOME[2]);
  });

  it("clamps out-of-range and invalid progress", () => {
    expect(journeyPose(-3)).toEqual(journeyPose(0));
    expect(journeyPose(9)).toEqual(journeyPose(1));
    expect(journeyPose(Number.NaN)).toEqual(journeyPose(0));
  });

  it("moves smoothly", () => {
    for (let p = 0; p < 1; p += 0.01) {
      const a = journeyPose(p).eye;
      const b = journeyPose(p + 0.01).eye;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.2);
    }
  });
});

describe("focusPose", () => {
  const fovY = (40 * Math.PI) / 180;
  const target = { position: [3, 0, 4] as [number, number, number], height: 0.8 };

  it("stands in front of and above the flower, close to it", () => {
    const pose = focusPose(target, 16 / 9, fovY);
    expect(pose.eye[2]).toBeGreaterThan(target.position[2]);
    expect(pose.eye[1]).toBeGreaterThan(target.position[1] + target.height * 0.5);
    expect(Math.hypot(pose.eye[0] - 3, pose.eye[2] - 4)).toBeLessThan(3.5);
  });

  it("frames the flower left of centre on landscape screens and high on portrait ones", () => {
    const wide = focusPose(target, 16 / 9, fovY);
    expect(wide.look[0]).toBeGreaterThan(target.position[0]);
    const tall = focusPose(target, 9 / 19, fovY);
    expect(tall.look[0]).toBeCloseTo(target.position[0]);
    expect(tall.look[1]).toBeLessThan(target.position[1] + target.height * 0.55);
  });

  it("tolerates odd heights", () => {
    const pose = focusPose({ position: [0, 0, 0], height: Number.NaN }, 1.5, fovY);
    expect(pose.eye.every(Number.isFinite)).toBe(true);
  });
});

describe("blendPoses", () => {
  it("returns the ends at 0 and 1", () => {
    const a = journeyPose(0);
    const b = journeyPose(1);
    expect(blendPoses(a, b, 0)).toEqual(a);
    expect(blendPoses(a, b, 1)).toEqual(b);
  });
});
