import { describe, expect, it } from "vitest";
import { generateFlower } from "./generate";
import { dot, normalize } from "./math";
import { MATERIAL, placePoint, type Placement } from "./parts";
import {
  DRIFT_LIFE,
  DRIFT_MODE,
  DRIFT_RELEASE,
  DRIFT_SEED_FLOATS,
  DRIFT_SEEDS_PER_BLOW,
  HALO_FLOATS,
  HALO_FADE,
  STILL_FADE,
  blowDuration,
  clearPuffHalo,
  clearSeedDrift,
  packPuffHalo,
  packSeedDrift,
  seedTimings,
} from "./seed-drift";

const puff = generateFlower({ type: "dandelion", seed: 3, growth: 1, puff: true });
const placement: Placement = { position: [1.5, 0.2, -3], yaw: 0.7, scale: 1 };
const wind: [number, number, number] = [1, 0, 0];

describe("a seed puff's own seeds", () => {
  it("are recorded as the puff's achene, beak and pappus parts", () => {
    const pappus = puff.blobs.filter((b) => b.material === MATERIAL.pappus);
    expect(puff.puffSeeds.length).toBe(pappus.length);
    expect(puff.puffSeeds.length).toBeGreaterThanOrEqual(70);
    expect(puff.puffSeeds.length).toBeLessThanOrEqual(DRIFT_SEEDS_PER_BLOW);
    puff.puffSeeds.forEach((seed, i) => {
      expect(seed.pappus).toBe(pappus[i]);
      expect(puff.blobs).toContain(seed.achene);
      expect(puff.tubes).toContain(seed.beak);
      // The achene, beak and pappus line up along the seed's axis.
      expect(dot(normalize([seed.beak.p3[0] - seed.beak.p0[0], seed.beak.p3[1] - seed.beak.p0[1], seed.beak.p3[2] - seed.beak.p0[2]]), seed.axis)).toBeCloseTo(1, 5);
    });
  });

  it("exist only for a blooming dandelion gone to seed", () => {
    expect(generateFlower({ type: "dandelion", seed: 3, growth: 1 }).puffSeeds).toHaveLength(0);
    expect(generateFlower({ type: "dandelion", seed: 3, growth: 0.8, puff: true }).puffSeeds).toHaveLength(0);
    expect(generateFlower({ type: "rose", seed: 3, growth: 1 }).puffSeeds).toHaveLength(0);
  });
});

describe("seed timing", () => {
  it("lets every seed go within the release window, downwind side first, and fades all within about four to six seconds", () => {
    const timings = seedTimings(puff.puffSeeds, 3, wind, false);
    for (const t of timings) {
      expect(t.release).toBeGreaterThanOrEqual(0);
      expect(t.release).toBeLessThanOrEqual(DRIFT_RELEASE);
      expect(t.life).toBeGreaterThanOrEqual(DRIFT_LIFE[0]);
      expect(t.life).toBeLessThanOrEqual(DRIFT_LIFE[1]);
    }
    const duration = blowDuration(timings);
    expect(duration).toBeGreaterThanOrEqual(4);
    expect(duration).toBeLessThanOrEqual(6);
    // Seeds facing downwind go before those facing into the breeze, on average.
    const mean = (pick: (axis: number) => boolean) => {
      const chosen = timings.filter((_, i) => pick(dot(puff.puffSeeds[i]!.axis, wind)));
      return chosen.reduce((sum, t) => sum + t.release, 0) / chosen.length;
    };
    expect(mean((d) => d > 0.5)).toBeLessThan(mean((d) => d < -0.5));
  });

  it("is the same for the same flower and differs between flowers", () => {
    expect(seedTimings(puff.puffSeeds, 3, wind, false)).toEqual(seedTimings(puff.puffSeeds, 3, wind, false));
    expect(seedTimings(puff.puffSeeds, 4, wind, false)).not.toEqual(seedTimings(puff.puffSeeds, 3, wind, false));
  });

  it("fades every seed together under reduced motion", () => {
    const timings = seedTimings(puff.puffSeeds, 3, wind, true);
    expect(new Set(timings.map((t) => `${t.release}/${t.life}`))).toEqual(new Set([`0/${STILL_FADE}`]));
  });
});

describe("drift records", () => {
  it("start every seed exactly where the drawn puff paints it", () => {
    const out = new Float32Array(2 * DRIFT_SEEDS_PER_BLOW * DRIFT_SEED_FLOATS);
    const packed = packSeedDrift(out, DRIFT_SEEDS_PER_BLOW, puff, { seed: 3, placement, phase: 0.25 }, { start: 10, wind, speed: 0.2, still: false });
    expect(packed.count).toBe(puff.puffSeeds.length);
    expect(packed.end).toBeCloseTo(10 + blowDuration(seedTimings(puff.puffSeeds, 3, wind, false)), 4);
    // The first slot is untouched.
    expect(out.subarray(0, DRIFT_SEEDS_PER_BLOW * DRIFT_SEED_FLOATS).every((v) => v === 0)).toBe(true);
    puff.puffSeeds.forEach((seed, i) => {
      const o = (DRIFT_SEEDS_PER_BLOW + i) * DRIFT_SEED_FLOATS;
      const pivot = placePoint(seed.pappus.center, placement);
      expect(out[o]).toBeCloseTo(pivot[0], 5);
      expect(out[o + 1]).toBeCloseTo(pivot[1], 5);
      expect(out[o + 2]).toBeCloseTo(pivot[2], 5);
      expect(out[o + 3]).toBeGreaterThanOrEqual(10);
      expect(out[o + 23]).toBe(DRIFT_MODE.drift);
      // The achene sits behind the pappus along the axis.
      expect(out[o + 27]).toBeLessThan(0);
      // Sway phase and the plant's base match the drawn flower.
      expect(out[o + 20]).toBe(0.25);
      expect([out[o + 16], out[o + 17], out[o + 18]]).toEqual([1.5, Math.fround(0.2), -3]);
    });
  });

  it("can be cleared slot by slot", () => {
    const out = new Float32Array(DRIFT_SEEDS_PER_BLOW * DRIFT_SEED_FLOATS);
    packSeedDrift(out, 0, puff, { seed: 3, placement, phase: 0 }, { start: 0, wind, speed: 0.2, still: true });
    expect(out[23]).toBe(DRIFT_MODE.still);
    clearSeedDrift(out, 0, DRIFT_SEEDS_PER_BLOW);
    expect(out[23]).toBe(DRIFT_MODE.off);
  });

  it("dissolves the puff's own glow as the seeds go", () => {
    const out = new Float32Array(2 * HALO_FLOATS);
    packPuffHalo(out, 1, puff, placement, 4, false);
    const center = placePoint(puff.aura!.center, placement);
    expect(Array.from(out.subarray(HALO_FLOATS, HALO_FLOATS + 3))).toEqual(center.map(Math.fround));
    expect(out[HALO_FLOATS + 7]).toBe(4);
    expect(out[HALO_FLOATS + 8]).toBeCloseTo(HALO_FADE, 5);
    packPuffHalo(out, 1, puff, placement, 4, true);
    expect(out[HALO_FLOATS + 8]).toBeCloseTo(STILL_FADE, 5);
    clearPuffHalo(out, 1);
    expect(out[HALO_FLOATS + 3]).toBe(0);
  });
});
