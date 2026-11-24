import { describe, expect, it } from "vitest";
import { FLOWER_TYPES, generateFlower, growthFor, growthStage, packFlowers, type FlowerSpec } from "./generate";
import { linear, seedHash } from "./math";
import { IDENTITY_PLACEMENT, MATERIAL, PART_ATTRIBUTES, PART_FLOATS } from "./parts";

const pack = (spec: FlowerSpec) => packFlowers([{ model: generateFlower(spec), placement: IDENTITY_PLACEMENT, phase: 0 }]);
const GROWTHS = [0, 0.15, 0.38, 0.72, 1];

describe("procedural flowers", () => {
  it("packs one vec4 attribute per four floats", () => {
    expect(Object.keys(PART_ATTRIBUTES)).toHaveLength(PART_FLOATS / 4);
  });

  it("maps growth to stages", () => {
    expect(growthStage(0)).toBe("seedling");
    expect(growthStage(0.24)).toBe("seedling");
    expect(growthStage(0.25)).toBe("bud");
    expect(growthStage(0.5)).toBe("opening");
    expect(growthStage(0.99)).toBe("opening");
    expect(growthStage(1)).toBe("bloom");
    expect(growthFor(7).fraction).toBe(1);
    expect(growthFor(Number.NaN).stage).toBe("seedling");
    expect(growthFor(1).open).toBe(1);
    expect(growthFor(0.3).open).toBe(0);
  });

  it.each(FLOWER_TYPES)("%s: the same seed always yields the same plant", (type) => {
    for (const growth of GROWTHS) {
      const spec = { type, seed: 424_242, growth };
      expect(pack(spec)).toEqual(pack(spec));
    }
  });

  it.each(FLOWER_TYPES)("%s: different seeds give visibly different plants", (type) => {
    const seeds = [1, 2, 3, 2 ** 40 + 5];
    const plants = seeds.map((seed) => pack({ type, seed, growth: 1 }));
    for (let i = 0; i < plants.length; i += 1) {
      for (let j = i + 1; j < plants.length; j += 1) {
        expect(plants[i]!.sheets).not.toEqual(plants[j]!.sheets);
        expect(plants[i]!.tubes).not.toEqual(plants[j]!.tubes);
      }
    }
    const heights = seeds.map((seed) => generateFlower({ type, seed, growth: 1 }).height);
    expect(new Set(heights.map((h) => h.toFixed(4))).size).toBeGreaterThan(1);
  });

  it.each(FLOWER_TYPES)("%s: builds a finite, sensible plant at every stage", (type) => {
    let previousHeight = 0;
    for (const growth of GROWTHS) {
      const model = generateFlower({ type, seed: 99, growth });
      expect(model.stage).toBe(growthStage(growth));
      const packed = pack({ type, seed: 99, growth });
      expect(packed.sheetCount + packed.tubeCount + packed.blobCount).toBeGreaterThan(0);
      for (const data of [packed.sheets, packed.tubes, packed.blobs, packed.auras]) {
        expect(data.every((v) => Number.isFinite(v))).toBe(true);
      }
      expect(model.height).toBeGreaterThan(0);
      expect(model.height).toBeLessThan(1.6);
      expect(model.radius).toBeLessThan(0.6);
      // Plants grow taller from seedling to bloom.
      expect(model.height).toBeGreaterThanOrEqual(previousHeight * 0.95);
      previousHeight = model.height;
      // Sheets carry unit directions and perpendicular front normals.
      for (const sheet of model.sheets) {
        expect(Math.hypot(...sheet.dir)).toBeCloseTo(1, 4);
        expect(Math.abs(sheet.dir[0] * sheet.normal[0] + sheet.dir[1] * sheet.normal[1] + sheet.dir[2] * sheet.normal[2])).toBeLessThan(1e-3);
      }
    }
    expect(generateFlower({ type, seed: 99, growth: 1 }).aura).not.toBeNull();
    expect(generateFlower({ type, seed: 99, growth: 1 }).height).toBeGreaterThan(generateFlower({ type, seed: 99, growth: 0 }).height * 1.5);
  });

  it("keeps a plant's identity as it grows", () => {
    const opening = generateFlower({ type: "rose", seed: 5, growth: 0.7 });
    const bloom = generateFlower({ type: "rose", seed: 5, growth: 1 });
    expect(opening.sheets.length).toBe(bloom.sheets.length);
    const petals = (m: typeof bloom) => m.sheets.filter((s) => s.material === MATERIAL.petal);
    expect(petals(opening)[0]!.tip).toEqual(petals(bloom)[0]!.tip);
  });

  it("uses both halves of a 53-bit seed", () => {
    expect(seedHash(0, "x")).not.toBe(seedHash(2 ** 32, "x"));
    expect(seedHash(2 ** 53 - 1, "x")).not.toBe(seedHash(2 ** 53 - 1 - 2 ** 40, "x"));
    expect(pack({ type: "tulip", seed: 2 ** 53 - 1, growth: 1 }).sheets).not.toEqual(pack({ type: "tulip", seed: 2 ** 52 - 1, growth: 1 }).sheets);
  });

  it("colours hydrangea florets from mood colours when given", () => {
    const moods = ["#6f9eab", "#d88798"];
    const targets = moods.map(linear);
    const model = generateFlower({ type: "hydrangea", seed: 12, growth: 1, moodColors: [...moods, "not-a-colour"] });
    const florets = model.sheets.filter((s) => s.material === MATERIAL.petal);
    expect(florets.length).toBeGreaterThan(100);
    for (const floret of florets) {
      const nearest = Math.min(...targets.map((t) => Math.hypot(t[0] - floret.tip[0], t[1] - floret.tip[1], t[2] - floret.tip[2])));
      expect(nearest).toBeLessThan(0.12);
    }
    expect(pack({ type: "hydrangea", seed: 12, growth: 1, moodColors: moods }).sheets).not.toEqual(pack({ type: "hydrangea", seed: 12, growth: 1 }).sheets);
  });

  it("turns a blooming dandelion into a seed puff on request", () => {
    const flower = generateFlower({ type: "dandelion", seed: 3, growth: 1 });
    const puff = generateFlower({ type: "dandelion", seed: 3, growth: 1, puff: true });
    expect(flower.blobs.some((b) => b.material === MATERIAL.pappus)).toBe(false);
    expect(puff.blobs.filter((b) => b.material === MATERIAL.pappus).length).toBeGreaterThan(50);
    // A dandelion still growing is never a puff.
    expect(generateFlower({ type: "dandelion", seed: 3, growth: 0.7, puff: true }).blobs.some((b) => b.material === MATERIAL.pappus)).toBe(false);
  });

  it("gives a cactus its flower only once it reaches the bud stage", () => {
    const petals = (growth: number) => generateFlower({ type: "cactus", seed: 8, growth }).sheets.filter((s) => s.material === MATERIAL.petal).length;
    expect(petals(0.2)).toBe(0);
    expect(petals(1)).toBeGreaterThan(10);
  });

  it("places flowers with their yaw, scale and position", () => {
    const model = generateFlower({ type: "daisy", seed: 1, growth: 1 });
    const here = packFlowers([{ model, placement: IDENTITY_PLACEMENT, phase: 0.5 }]);
    const there = packFlowers([{ model, placement: { position: [2, 0, -3], yaw: 0, scale: 2 }, phase: 0.5 }]);
    // Tube start points are translated and scaled; radii scale too.
    expect(there.tubes[0]).toBeCloseTo(here.tubes[0]! * 2 + 2, 5);
    expect(there.tubes[2]).toBeCloseTo(here.tubes[2]! * 2 - 3, 5);
    expect(there.tubes[3]).toBeCloseTo(here.tubes[3]! * 2, 6);
    // Every part carries the flower's anchor (base and height) and phase.
    expect(Array.from(there.tubes.slice(40, 44))).toEqual([2, 0, -3, Math.fround(model.height * 2)]);
    expect(there.tubes[21]).toBe(0.5);
  });
});
