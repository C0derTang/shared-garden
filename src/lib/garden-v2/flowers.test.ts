import { describe, expect, it } from "vitest";
import { moodColorOf } from "@/lib/garden/moods";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { catalogItem, gardenCareStatus, gardenDayLabel, gardenTodayPlan, growthFraction, hasCareActivity, plantSpec, previewSeed, stageWords } from "./flowers";
import { flowerTypes, type Plant } from "./model";

function plant(patch: Partial<Plant["flower"]>, extra: Partial<Plant> = {}): Plant {
  const base = v2GardenFixture().plants[0]!;
  return { ...base, ...extra, flower: { ...base.flower, ...patch } };
}
const state = v2GardenFixture();

describe("new-garden flowers", () => {
  it("grows from the fraction of the target, and blooms fully", () => {
    const rose = catalogItem(state, "rose");
    expect(growthFraction(plant({ growth_units: 2 }), rose)).toBeCloseTo(0.4);
    expect(growthFraction(plant({ growth_units: 5, first_bloom_at: "2026-11-02T12:00:00Z", first_bloom_day: "2026-11-02" }), rose)).toBe(1);
    expect(stageWords(plant({ growth_units: 0 }), rose)).toBe("just planted");
    expect(stageWords(plant({ growth_units: 3 }), rose)).toBe("opening");
  });

  it("paints both members' mood colors on a Hydrangea", () => {
    const hydrangea = plant({ type_key: "hydrangea" }, { hydrangea_picks: [{ mood: "calm", mood2: "joyful" }, { mood: "other", note: "Hm" }] });
    expect(plantSpec(hydrangea, catalogItem(state, "hydrangea")).moodColors).toEqual([moodColorOf("calm"), moodColorOf("joyful")]);
    const unpicked = plant({ type_key: "hydrangea" });
    expect(plantSpec(unpicked, catalogItem(state, "hydrangea")).moodColors).toBeUndefined();
  });

  it("shows a seed puff while a bloomed Dandelion's wish waits, and its golden head once fulfilled", () => {
    const bloom = { type_key: "dandelion" as const, shared_wish: "A wish", growth_units: 5, first_bloom_at: "2026-11-02T12:00:00Z", first_bloom_day: "2026-11-02" };
    const item = catalogItem(state, "dandelion");
    expect(plantSpec(plant({ ...bloom, first_bloom_at: null, first_bloom_day: null, growth_units: 2 }), item).puff).toBeUndefined();
    expect(plantSpec(plant(bloom), item).puff).toBe(true);
    const fulfilled = plant({ ...bloom, fulfilled_at: "2026-11-02T13:00:00Z", fulfilled_by: 2 });
    expect(plantSpec(fulfilled, item).puff).toBeUndefined();
    expect(stageWords(fulfilled, item)).toBe("wish fulfilled");
  });

  it("gives every flower its activity, including the Sunflower, Bluebell and Peony", () => {
    expect(flowerTypes.every((type) => hasCareActivity(type))).toBe(true);
  });

  it("labels days and gives each type a stable preview seed", () => {
    expect(gardenDayLabel("2026-11-24")).toBe("Nov 24");
    expect(previewSeed("rose")).toBe(previewSeed("rose"));
    expect(previewSeed("rose")).not.toBe(previewSeed("tulip"));
  });

  it("treats the Sunflower and Bluebell as due like any daily care, and never the Peony", () => {
    const garden = v2GardenFixture();
    const rose = garden.plants[0]!;
    rose.member1_submitted = false;
    for (const [i, type] of (["sunflower", "bluebell", "peony"] as const).entries())
      garden.plants.push({ ...structuredClone(rose), flower: { ...rose.flower, id: `flower-${type}`, spot: i + 2, type_key: type } });
    const status = (type: string) => {
      const plant = garden.plants.find((p) => p.flower.type_key === type)!;
      return gardenCareStatus(plant, catalogItem(garden, plant.flower.type_key), garden);
    };
    expect(status("sunflower")?.dueForYou).toBe(true);
    expect(status("bluebell")?.dueForYou).toBe(true);
    // The Peony's milestones keep their own order; it takes no daily care.
    expect(status("peony")).toBeNull();
    expect(gardenTodayPlan(garden).rows.map((row) => row.plant.flower.type_key)).toEqual(["rose", "sunflower", "bluebell"]);
    for (const plant of garden.plants) {
      plant.member1_submitted = true;
      plant.member2_submitted = true;
    }
    expect(gardenTodayPlan(garden)).toMatchObject({ next: null, allTended: true });
  });
});
