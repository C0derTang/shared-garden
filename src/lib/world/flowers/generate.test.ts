import { describe, expect, it } from "vitest";
import { PLOT_GLOW } from "../glow";
import { spotPosition } from "../layout";
import { FLOWER_TYPES, generateFlower, growthFor, growthStage, packFlowers, seedlingScaleFor, type FlowerSpec } from "./generate";
import { linear, seedHash } from "./math";
import { IDENTITY_PLACEMENT, MATERIAL, PART_ATTRIBUTES, PART_FLOATS } from "./parts";
import { SEEDLING_SCALE } from "./species";

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

describe("a larger sprout (#214)", () => {
  // Height of seed 7 at growth 0, 0.12 and 0.24 (seedling), then 0.25, 0.5 and 1, before #214.
  const BEFORE: Record<string, readonly number[]> = {
    rose: [0.08505, 0.10498, 0.14774, 0.36036, 0.54049, 0.76402],
    cactus: [0.13555, 0.15264, 0.19334, 0.21792, 0.34711, 0.46993],
    tulip: [0.10228, 0.11751, 0.13454, 0.35833, 0.46046, 0.6845],
    marigold: [0.08691, 0.10719, 0.14774, 0.29318, 0.44409, 0.62293],
    daisy: [0.08412, 0.10387, 0.14774, 0.28929, 0.44072, 0.61307],
    hydrangea: [0.08701, 0.10731, 0.14774, 0.32039, 0.47469, 0.73622],
    sunflower: [0.08576, 0.10583, 0.14774, 0.55053, 0.84353, 1.28714],
    snapdragon: [0.08504, 0.10496, 0.14774, 0.37824, 0.59115, 0.90307],
    moonflower: [0.08693, 0.10722, 0.14774, 0.33136, 0.50619, 0.79175],
    bluebell: [0.09921, 0.11395, 0.13043, 0.21382, 0.26258, 0.38723],
    dandelion: [0.08658, 0.1068, 0.14774, 0.15311, 0.22914, 0.3522],
    "forget-me-not": [0.0836, 0.10325, 0.14774, 0.14718, 0.22034, 0.35443],
    peony: [0.08396, 0.10368, 0.14774, 0.37983, 0.56676, 0.81727],
  };
  const GROWTH = [0, 0.12, 0.24, 0.25, 0.5, 1];

  // Seed 7's first bud is taller than 1.3 times its seedling for these; for the Dandelion and
  // Forget-me-not the cap below binds, and the Cactus's seedling is a ball that keeps its size.
  const UNCAPPED = FLOWER_TYPES.filter((type) => !["cactus", "dandelion", "forget-me-not"].includes(type));

  it("draws every seedling shoot 1.3 times its former size where its first bud allows, and nothing else", () => {
    expect(SEEDLING_SCALE).toBe(1.3);
    for (const type of UNCAPPED) expect(seedlingScaleFor(type, 7), type).toBe(SEEDLING_SCALE);
    expect(seedlingScaleFor("cactus", 7)).toBe(1);
    for (const type of FLOWER_TYPES) {
      GROWTH.forEach((growth, i) => {
        const height = generateFlower({ type, seed: 7, growth }).height;
        // Every later stage keeps its size.
        const expected = growth < 0.25 ? BEFORE[type]![i]! * seedlingScaleFor(type, 7) : BEFORE[type]![i]!;
        expect(height, `${type} at ${growth}`).toBeCloseTo(expected, 4);
      });
    }
  });

  // Real growth targets (the flower catalogue), so these are the steps a flower actually takes.
  const TARGETS: Record<string, number> = {
    rose: 5, cactus: 10, tulip: 7, marigold: 5, daisy: 7, hydrangea: 7, sunflower: 7,
    snapdragon: 5, moonflower: 5, bluebell: 7, dandelion: 5, "forget-me-not": 10, peony: 4,
  };

  it("never lets a sprout outgrow its first bud, or shrink into it more than before (seeds 1–300)", () => {
    for (const type of FLOWER_TYPES) {
      const target = TARGETS[type]!;
      const steps = Array.from({ length: target + 1 }, (_, units) => units / target);
      const lastSeedling = steps.filter((growth) => growth < 0.25).at(-1)!;
      const firstBud = steps.find((growth) => growth >= 0.25)!;
      for (let seed = 1; seed <= 300; seed += 1) {
        const scale = seedlingScaleFor(type, seed);
        expect(scale).toBeGreaterThanOrEqual(1);
        expect(scale).toBeLessThanOrEqual(SEEDLING_SCALE);
        const bud = generateFlower({ type, seed, growth: firstBud }).height;
        const sprout = generateFlower({ type, seed, growth: lastSeedling }).height;
        // The shoot scales as a whole, so its height before #214 was sprout / scale.
        const before = sprout / scale;
        expect(bud / sprout, `${type} ${seed}`).toBeGreaterThanOrEqual(Math.min(1, bud / before) - 1e-9);
        if (scale > 1) {
          // Wherever it is enlarged, even its largest seedling stays within its smallest bud.
          const peak = generateFlower({ type, seed, growth: 0.25 - 1e-6 }).height;
          expect(peak, `${type} ${seed}`).toBeLessThanOrEqual(generateFlower({ type, seed, growth: 0.25 }).height + 1e-9);
          expect(sprout, `${type} ${seed}`).toBeLessThanOrEqual(bud + 1e-9);
        }
      }
    }
  });

  it("widens the leaf span with the height", () => {
    // Reach of seed 7's shoot at growth 0.24, before #214.
    const reach: Record<string, number> = {
      rose: 0.0542,
      tulip: 0.03137,
      marigold: 0.06154,
      daisy: 0.05545,
      hydrangea: 0.05551,
      sunflower: 0.05288,
      snapdragon: 0.05805,
      moonflower: 0.05291,
      bluebell: 0.04731,
      dandelion: 0.05596,
      "forget-me-not": 0.05375,
      peony: 0.06069,
    };
    for (const [type, before] of Object.entries(reach)) {
      const scale = seedlingScaleFor(type as FlowerSpec["type"], 7);
      expect(generateFlower({ type: type as FlowerSpec["type"], seed: 7, growth: 0.24 }).radius, type).toBeCloseTo(before * scale, 4);
    }
  });

  it("keeps a sprout clear of its neighbours' spots, and its halo within the glow band", () => {
    const spots = Array.from({ length: 48 }, (_, i) => spotPosition(i + 1).position);
    let spacing = Infinity;
    for (let i = 0; i < spots.length; i += 1)
      for (let j = i + 1; j < spots.length; j += 1) spacing = Math.min(spacing, Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![2] - spots[j]![2]));
    let reach = 0;
    let widest = 0;
    for (const type of FLOWER_TYPES) {
      for (const seed of [1, 7, 99, 123_456]) {
        for (const growth of [0, 0.1, 0.2, 0.249]) {
          const sprout = generateFlower({ type, seed, growth });
          reach = Math.max(reach, sprout.radius);
          // A sprout's own halo never needs to be cut back to the band's top.
          expect(sprout.aura.radius).toBeLessThanOrEqual(PLOT_GLOW.maxRadius);
        }
        widest = Math.max(widest, generateFlower({ type, seed, growth: 1 }).radius);
      }
    }
    expect(reach).toBeLessThan(0.12);
    // Even beside the widest bloom, a sprout's leaves stay out of the neighbouring spot's plant.
    expect(reach + widest).toBeLessThan(spacing);
  });
});
