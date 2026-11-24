import { describe, expect, it } from "vitest";
import { journeyPose } from "./journey";
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
