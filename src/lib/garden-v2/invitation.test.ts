import { describe, expect, it } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { nextGardenVisit } from "./invitation";
import type { FlowerType } from "./model";

describe("the garden invitation", () => {
  it("opens the real partner-cared UUID before an earlier unpaired plant, including sparse same-type overflow", () => {
    const state = v2GardenFixture();
    const original = state.plants[0]!;
    original.member1_submitted = false;
    state.plants.push({ ...structuredClone(original), member2_submitted: true, flower: { ...original.flower, id: "00000000-0000-4000-8000-000000000099", spot: 12001 } });
    expect(nextGardenVisit(state)).toMatchObject({ id: "00000000-0000-4000-8000-000000000099", name: "rose", action: "write a note" });
    state.plants[1]!.member1_submitted = true;
    expect(nextGardenVisit(state)?.id).toBe(original.flower.id);
  });

  it("never calls partner-only, closed-window, empty, bloomed or milestone care a due activity", () => {
    const state = v2GardenFixture();
    expect(nextGardenVisit(state)).toBeNull(); // only the partner is due
    const plant = state.plants[0]!;
    plant.member1_submitted = false;
    plant.flower.type_key = "moonflower";
    expect(nextGardenVisit(state)).toBeNull();
    state.moonflower_open = true;
    expect(nextGardenVisit(state)?.action).toBe("leave a late-night thought");
    plant.flower.type_key = "peony";
    expect(nextGardenVisit(state)).toBeNull();
    plant.flower.type_key = "dandelion";
    plant.flower.first_bloom_at = state.server_now;
    expect(nextGardenVisit(state)).toBeNull();
    plant.flower.fulfilled_at = state.server_now;
    expect(nextGardenVisit(state)).toBeNull();
    state.plants = [];
    expect(nextGardenVisit(state)).toBeNull();
  });

  it.each([
    ["cactus", /check in/], ["tulip", /song/], ["marigold", /appreciation/], ["daisy", /question/],
    ["hydrangea", /mood color/], ["sunflower", /photo/], ["snapdragon", /honest check-in/],
    ["bluebell", /voice memo/], ["dandelion", /wish/], ["forget-me-not", /memory/],
  ] as [FlowerType, RegExp][])("explains the existing %s activity without metaphor memory", (type, words) => {
    const state = v2GardenFixture();
    state.plants[0]!.member1_submitted = false;
    state.plants[0]!.flower.type_key = type;
    expect(nextGardenVisit(state)?.action).toMatch(words);
  });
});
