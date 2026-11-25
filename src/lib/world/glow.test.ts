import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FLOWER_TYPES, generateFlower, packFlowers, AURA_FLOATS } from "./flowers/generate";
import { PLOT_GLOW, SEED_GLOW, SPROUT_GLOW, evenGlowColor, evenGlowRadius, luminance, plotGlowLevel, sceneExposure } from "./glow";
import { worldLightingFor } from "./sky-palette";
import { skyStateAt } from "./solar";
import { SKY_PRESETS } from "./sky-presets";

const STAGES = [0, 0.15, 0.3, 0.6, 1];

describe("one glow rule for every plot", () => {
  it("gives every type at every stage an aura of the same luminance, seedlings included", () => {
    for (const type of FLOWER_TYPES) {
      for (const growth of STAGES) {
        for (const seed of [1, 99, 123_456]) {
          const aura = generateFlower({ type, seed, growth }).aura;
          expect(aura, `${type} ${growth}`).not.toBeNull();
          expect(luminance(aura.color)).toBeCloseTo(PLOT_GLOW.luminance, 4);
          expect(Math.max(...aura.color)).toBeLessThanOrEqual(PLOT_GLOW.channelLimit + 1e-6);
        }
      }
    }
  });

  it("keeps a puff and mood-coloured hydrangea on the same rule", () => {
    expect(luminance(generateFlower({ type: "dandelion", seed: 5, growth: 1, puff: true }).aura.color)).toBeCloseTo(PLOT_GLOW.luminance, 4);
    expect(luminance(generateFlower({ type: "hydrangea", seed: 5, growth: 1, moodColors: ["#203080", "#ff2020"] }).aura.color)).toBeCloseTo(PLOT_GLOW.luminance, 4);
  });

  it("softens deep hues toward white so a blue halo does not flare", () => {
    const blue = evenGlowColor([0.02, 0.05, 1]);
    expect(luminance(blue)).toBeCloseTo(PLOT_GLOW.luminance, 5);
    expect(Math.max(...blue)).toBeLessThanOrEqual(PLOT_GLOW.channelLimit + 1e-6);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(evenGlowColor([0, 0, 0])).toEqual([PLOT_GLOW.luminance, PLOT_GLOW.luminance, PLOT_GLOW.luminance]);
  });

  it("keeps every world halo within one radius band, from seed mark to bloom", () => {
    expect(evenGlowRadius(0.01)).toBe(PLOT_GLOW.minRadius);
    expect(evenGlowRadius(2)).toBe(PLOT_GLOW.maxRadius);
    expect(evenGlowRadius(Number.NaN)).toBe(PLOT_GLOW.minRadius);
    const placed = FLOWER_TYPES.flatMap((type, i) =>
      STAGES.map((growth) => ({ model: generateFlower({ type, seed: i + 3, growth }), placement: { position: [0, 0, 0] as [number, number, number], yaw: 0, scale: 1 }, phase: 0 })),
    );
    const packed = packFlowers(placed, { evenAuraRadius: true });
    expect(packed.auraCount).toBe(placed.length);
    for (let a = 0; a < packed.auraCount; a += 1) {
      const radius = packed.auras[a * AURA_FLOATS + 3]!;
      expect(radius).toBeGreaterThanOrEqual(PLOT_GLOW.minRadius - 1e-6);
      expect(radius).toBeLessThanOrEqual(PLOT_GLOW.maxRadius + 1e-6);
    }
  });

  it("holds the displayed glow level through the day and eases it at night", () => {
    const displayed = (preset: keyof typeof SKY_PRESETS) => {
      const lighting = worldLightingFor(skyStateAt(new Date(SKY_PRESETS[preset])));
      return { value: plotGlowLevel(lighting) * PLOT_GLOW.luminance * sceneExposure(lighting), night: lighting.night };
    };
    expect(displayed("day").value).toBeCloseTo(PLOT_GLOW.base, 5);
    expect(displayed("morning").value).toBeCloseTo(PLOT_GLOW.base, 5);
    const night = displayed("night");
    expect(night.night).toBeGreaterThan(0.9);
    expect(night.value).toBeCloseTo(PLOT_GLOW.base * (1 - PLOT_GLOW.nightEase * night.night), 5);
    // The raw level falls as the exposure rises, so the night's brighter exposure does not over-glow.
    const day = worldLightingFor(skyStateAt(new Date(SKY_PRESETS.day)));
    const dark = worldLightingFor(skyStateAt(new Date(SKY_PRESETS.night)));
    expect(plotGlowLevel(dark)).toBeLessThan(plotGlowLevel(day));
  });

  it("brightens a hovered plot by one moderate boost", () => {
    expect(PLOT_GLOW.hoverBoost).toBeGreaterThan(1.5);
    expect(PLOT_GLOW.hoverBoost).toBeLessThan(2.5);
    expect(PLOT_GLOW.hoverGrow).toBeGreaterThan(1);
    expect(PLOT_GLOW.hoverGrow).toBeLessThan(1.5);
  });

  it("paints empty seed marks with the shared seed glow and the smallest halo", () => {
    const marker = readFileSync(path.join(process.cwd(), "src/components/world/shaders/marker.wgsl"), "utf8");
    const color = /const SEED_COLOR: vec3f = vec3f\(([^)]+)\);/.exec(marker)![1]!.split(",").map(Number);
    color.forEach((channel, i) => expect(channel).toBeCloseTo(SEED_GLOW[i]!, 3));
    expect(Number(/const SEED_RADIUS: f32 = ([\d.]+);/.exec(marker)![1])).toBe(PLOT_GLOW.minRadius);
    expect(luminance(SEED_GLOW)).toBeCloseTo(PLOT_GLOW.luminance, 5);
    expect(luminance(SPROUT_GLOW)).toBeCloseTo(PLOT_GLOW.luminance, 5);
    // The seed marks and the auras share the halo profile and the hover rule.
    expect(marker).toMatch(/plotHalo\(/);
    expect(marker).toMatch(/world\.plotBoost/);
    const aura = readFileSync(path.join(process.cwd(), "src/components/world/flowers/aura.wgsl"), "utf8");
    expect(aura).toMatch(/plotHalo\(/);
    expect(aura).toMatch(/flowers\.boost/);
  });
});
