import { describe, expect, it } from "vitest";
import {
  ARRIVAL_CHROME_SECONDS,
  ARRIVAL_CROSSFADE_SECONDS,
  ARRIVAL_LIGHT_DELAY,
  ARRIVAL_LIGHT_SECONDS,
  ARRIVAL_SECONDS,
  ARRIVAL_SETTLE_SECONDS,
  ARRIVAL_STILL_SETTLE_SECONDS,
  arrivalLightOpacity,
  arrivalPose,
  arrivalStage,
  arrivalStartPose,
} from "./arrival";
import { journeyPose } from "./journey";

const overview = journeyPose(0);

describe("the garden's arrival camera", () => {
  it("starts raised and a little closer, looking up toward the sky, then settles exactly on the overview", () => {
    const start = arrivalPose(0, overview);
    expect(start).toEqual(arrivalStartPose(overview));
    expect(start.eye[1]).toBeGreaterThan(overview.eye[1] + 1);
    expect(start.eye[2]).toBeLessThan(overview.eye[2]);
    expect(start.look[1]).toBeGreaterThan(overview.look[1] + 3);
    expect(arrivalPose(ARRIVAL_SECONDS, overview)).toEqual(overview);
    expect(arrivalPose(ARRIVAL_SECONDS + 5, overview)).toEqual(overview);
  });

  it("drifts back and down gently, easing in and out with no jumps", () => {
    const step = 1 / 60;
    let previous = arrivalPose(0, overview);
    let previousSpeed = 0;
    let fastest = 0;
    for (let t = step; t <= ARRIVAL_SECONDS + 1e-9; t += step) {
      const pose = arrivalPose(t, overview);
      // Always back (+z) and down, never reversing.
      expect(pose.eye[2]).toBeGreaterThanOrEqual(previous.eye[2] - 1e-9);
      expect(pose.eye[1]).toBeLessThanOrEqual(previous.eye[1] + 1e-9);
      const speed = Math.hypot(pose.eye[0] - previous.eye[0], pose.eye[1] - previous.eye[1], pose.eye[2] - previous.eye[2]) / step;
      // Speed changes by only a little from one frame to the next.
      expect(Math.abs(speed - previousSpeed)).toBeLessThan(0.05);
      fastest = Math.max(fastest, speed);
      previous = pose;
      previousSpeed = speed;
    }
    // Slow and soft: under a metre and a half per second at its fastest, at rest at both ends.
    expect(fastest).toBeLessThan(1.5);
    expect(previousSpeed).toBeLessThan(0.01);
  });

  it("follows the pose the garden would show, so scrolling during the arrival is kept", () => {
    const closer = journeyPose(0.4);
    expect(arrivalPose(ARRIVAL_SECONDS, closer)).toEqual(closer);
  });

  it("does not move at all under reduced motion", () => {
    expect(arrivalPose(0, overview, true)).toBe(overview);
    expect(arrivalPose(1, overview, true)).toBe(overview);
  });
});

describe("the arrival's warm light and stages", () => {
  it("holds the light while the world gets ready, then thins it away (eased) within about two seconds", () => {
    expect(arrivalLightOpacity(-1)).toBe(1);
    expect(arrivalLightOpacity(0)).toBe(1);
    expect(arrivalLightOpacity(ARRIVAL_LIGHT_DELAY)).toBe(1);
    let previous = 1;
    for (let t = 0; t <= 3; t += 0.05) {
      const opacity = arrivalLightOpacity(t);
      expect(opacity).toBeLessThanOrEqual(previous);
      previous = opacity;
    }
    expect(arrivalLightOpacity(ARRIVAL_LIGHT_DELAY + ARRIVAL_LIGHT_SECONDS / 2)).toBeCloseTo(0.5, 5);
    expect(arrivalLightOpacity(ARRIVAL_LIGHT_DELAY + ARRIVAL_LIGHT_SECONDS)).toBe(0);
    expect(ARRIVAL_LIGHT_SECONDS).toBeGreaterThanOrEqual(1.5);
    expect(ARRIVAL_LIGHT_SECONDS).toBeLessThanOrEqual(2.5);
  });

  it("crossfades plainly under reduced motion", () => {
    expect(arrivalLightOpacity(-1, true)).toBe(1);
    expect(arrivalLightOpacity(ARRIVAL_CROSSFADE_SECONDS / 2, true)).toBeCloseTo(0.5, 5);
    expect(arrivalLightOpacity(ARRIVAL_CROSSFADE_SECONDS, true)).toBe(0);
  });

  it("brings in the title and menu after the light, and settles after the camera", () => {
    expect(arrivalStage(-1)).toBe("light");
    expect(arrivalStage(Number.NaN)).toBe("light");
    expect(arrivalStage(1)).toBe("light");
    expect(ARRIVAL_CHROME_SECONDS).toBeGreaterThanOrEqual(ARRIVAL_LIGHT_DELAY + ARRIVAL_LIGHT_SECONDS);
    expect(arrivalStage(ARRIVAL_CHROME_SECONDS)).toBe("chrome");
    expect(ARRIVAL_SETTLE_SECONDS).toBeGreaterThanOrEqual(ARRIVAL_SECONDS);
    expect(arrivalStage(ARRIVAL_SETTLE_SECONDS)).toBe("settled");
    expect(arrivalStage(0, true)).toBe("chrome");
    expect(arrivalStage(ARRIVAL_STILL_SETTLE_SECONDS, true)).toBe("settled");
  });
});
