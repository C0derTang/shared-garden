import { describe, expect, it } from "vitest";
import { moodColorOf } from "@/lib/garden/moods";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { catalogItem, gardenDayLabel, growthFraction, hasCareActivity, plantSpec, previewSeed, stageWords } from "./flowers";
import type { Plant } from "./model";

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

  it("keeps Sunflower, Bluebell and Peony activities for later", () => {
    expect(["sunflower", "bluebell", "peony"].map((t) => hasCareActivity(t as never))).toEqual([false, false, false]);
    expect(hasCareActivity("rose")).toBe(true);
  });

  it("labels days and gives each type a stable preview seed", () => {
    expect(gardenDayLabel("2026-11-24")).toBe("Nov 24");
    expect(previewSeed("rose")).toBe(previewSeed("rose"));
    expect(previewSeed("rose")).not.toBe(previewSeed("tulip"));
  });
});
