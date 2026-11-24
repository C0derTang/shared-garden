import { describe, expect, it } from "vitest";
import { hexToLinear, worldLightingFor } from "./sky-palette";
import type { SkyState } from "./solar";

const state = (elevation: number, morning = false): SkyState => ({
  elevation,
  azimuth: morning ? 80 : 280,
  morning,
  phase: elevation < -6 ? "night" : elevation >= 8 ? "day" : morning ? "dawn" : "dusk",
});

const luminance = (c: readonly number[]) => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;

describe("worldLightingFor", () => {
  it("is bright with no stars by day and dark with stars by night", () => {
    const day = worldLightingFor(state(55));
    const night = worldLightingFor(state(-30));
    expect(day.night).toBe(0);
    expect(day.stars).toBe(0);
    expect(night.night).toBe(1);
    expect(night.stars).toBe(1);
    expect(luminance(day.zenith)).toBeGreaterThan(luminance(night.zenith) * 5);
    expect(day.lightIntensity).toBeGreaterThan(night.lightIntensity);
  });

  it("glows warm around sunset", () => {
    const dusk = worldLightingFor(state(1));
    expect(dusk.glow).toBeGreaterThan(0.5);
    expect(dusk.lightColor[0]).toBeGreaterThan(dusk.lightColor[2]);
  });

  it("changes continuously with elevation", () => {
    for (let e = -20; e < 60; e += 0.5) {
      const a = worldLightingFor(state(e));
      const b = worldLightingFor(state(e + 0.5));
      expect(Math.abs(luminance(a.horizon) - luminance(b.horizon))).toBeLessThan(0.08);
      expect(Math.abs(a.lightIntensity - b.lightIntensity)).toBeLessThan(0.15);
    }
  });

  it("keeps light directions normalised and above the horizon", () => {
    for (const e of [-30, -5, 0, 10, 70]) {
      const lighting = worldLightingFor(state(e));
      expect(Math.hypot(...lighting.lightDirection)).toBeCloseTo(1);
      expect(lighting.lightDirection[1]).toBeGreaterThan(0);
    }
  });
});

describe("hexToLinear", () => {
  it("converts sRGB to linear light", () => {
    expect(hexToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToLinear("#000000")).toEqual([0, 0, 0]);
    expect(hexToLinear("#808080")[0]).toBeCloseTo(0.2158, 3);
  });
});
