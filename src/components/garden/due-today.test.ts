import { describe, expect, it } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { FlowerType } from "./flower-sprite";
import type { GardenState, Plant } from "@/lib/garden/model";
import { careStatus, cueLabel, sheetCue, takesDailyCare, todayPlan } from "./due-today";

function plant(
  state: GardenState,
  type: FlowerType,
  spot: number,
  options: Partial<Plant["flower"]> & { m1?: boolean; m2?: boolean } = {},
): Plant {
  const { m1 = false, m2 = false, ...flower } = options;
  const base = state.plants[0];
  return {
    ...base,
    flower: {
      ...base.flower,
      id: `00000000-0000-4000-8000-${String(spot).padStart(12, "0")}`,
      type_key: type,
      spot,
      is_initial: false,
      ...flower,
    },
    member1_submitted: m1,
    member2_submitted: m2,
  };
}
const item = (state: GardenState, type: FlowerType) =>
  state.catalog.find((c) => c.type_key === type)!;
const bloomed = { first_bloom_at: "2026-09-10T11:00:00Z", first_bloom_day: "2026-09-10" };

describe("takesDailyCare", () => {
  const state = gardenFixture();
  it.each([
    ["growing rose", plant(state, "rose", 2), true],
    ["bloomed rose", plant(state, "rose", 2, { ...bloomed, growth_units: 5 }), false],
    ["growing cactus", plant(state, "cactus", 1), true],
    ["bloomed cactus", plant(state, "cactus", 1, { ...bloomed, growth_units: 10 }), true],
    ["peony", plant(state, "peony", 3), false],
    ["growing dandelion", plant(state, "dandelion", 4), true],
    ["bloomed, unfulfilled dandelion", plant(state, "dandelion", 4, { ...bloomed, growth_units: 5 }), false],
    [
      "fulfilled dandelion",
      plant(state, "dandelion", 4, { ...bloomed, growth_units: 5, fulfilled_at: "2026-09-11T11:00:00Z", fulfilled_by: 1 }),
      false,
    ],
    ["growing moonflower", plant(state, "moonflower", 5), true],
  ])("%s → %s", (_, p, expected) => {
    expect(takesDailyCare(p)).toBe(expected);
    expect(careStatus(p, item(state, p.flower.type_key), state) !== null).toBe(expected);
  });
});

describe("careStatus cues", () => {
  const state = gardenFixture();
  const rose = item(state, "rose"); // target 5
  const status = (p: Plant, memberId: 1 | 2 = 1, open = false) =>
    careStatus(p, item(state, p.flower.type_key), { member_id: memberId, moonflower_open: open })!;

  it("maps you and partner by the signed-in member", () => {
    const p = plant(state, "rose", 2, { m1: true });
    expect(status(p, 1)).toMatchObject({ you: true, partner: false, dueForYou: false, dueForPartner: true });
    expect(status(p, 2)).toMatchObject({ you: false, partner: true, dueForYou: true, dueForPartner: false });
  });
  it("cues a pair your care would complete", () => {
    expect(status(plant(state, "rose", 2, { m2: true, growth_units: 0 })).cue).toBe("partner-cared");
    expect(status(plant(state, "rose", 2, { m2: true, growth_units: 0 }), 2).cue).toBeNull();
  });
  it("sparkles only when both cared and this unit reaches the target", () => {
    expect(status(plant(state, "rose", 2, { m1: true, m2: true, growth_units: rose.growth_target - 1 })).cue).toBe("blooms");
    expect(status(plant(state, "rose", 2, { m1: true, m2: true, growth_units: 2 })).cue).toBeNull();
    expect(status(plant(state, "cactus", 1, { m1: true, m2: true, growth_units: 9 })).cue).toBe("blooms");
    expect(status(plant(state, "cactus", 1, { ...bloomed, m1: true, m2: true, growth_units: 10 })).cue).toBeNull();
  });
  it("marks growth at risk only when neither cared and there is growth to lose", () => {
    expect(status(plant(state, "rose", 2, { growth_units: 3 })).cue).toBe("at-risk");
    expect(status(plant(state, "rose", 2, { growth_units: 0 })).cue).toBeNull();
    expect(status(plant(state, "rose", 2, { growth_units: 3, m1: true })).cue).toBeNull();
    // Cactus never loses growth.
    expect(status(plant(state, "cactus", 1, { growth_units: 4 })).cue).toBeNull();
  });
  it("keeps a closed Moonflower out of both counts until 10 p.m.", () => {
    const p = plant(state, "moonflower", 5, { growth_units: 2 });
    expect(status(p, 1, false)).toMatchObject({ later: true, dueForYou: false, dueForPartner: false, cue: "at-risk" });
    expect(status(p, 1, true)).toMatchObject({ later: false, dueForYou: true, dueForPartner: true });
  });
  it("labels each cue for buttons and the sheet heading", () => {
    expect(cueLabel("partner-cared")).toBe(", your partner cared, add yours");
    expect(cueLabel("blooms")).toBe(", blooms at 4 a.m.");
    expect(cueLabel("at-risk")).toBe(", may lose growth at 4 a.m.");
    expect(cueLabel(null)).toBe("");
    expect(sheetCue(status(plant(state, "rose", 2, { m2: true })))).toBe(
      "Your partner cared today. Add yours before 4 a.m. to grow.",
    );
    expect(sheetCue(status(plant(state, "cactus", 1, { ...bloomed, growth_units: 10, m2: true })))).toMatch(
      /check in together/,
    );
    expect(sheetCue(status(plant(state, "rose", 2, { m1: true, m2: true, growth_units: 4 })))).toBe(
      "You both cared today. It blooms at 4 a.m.",
    );
    expect(sheetCue(status(plant(state, "rose", 2, { growth_units: 1 })))).toMatch(/loses a growth unit/);
    expect(sheetCue(status(plant(state, "rose", 2, { m1: true })))).toBeNull();
    expect(sheetCue(null)).toBeNull();
  });
});

describe("todayPlan", () => {
  function garden(memberId: 1 | 2 = 1) {
    const state = gardenFixture();
    state.member_id = memberId;
    state.unlocks.push({ type_key: "moonflower", unlocked_at: state.server_now });
    state.plants = [
      plant(state, "cactus", 1, { m1: true, m2: true }),
      plant(state, "rose", 2, { growth_units: 2 }),
      plant(state, "tulip", 3, { m2: true }),
      plant(state, "marigold", 4, { m1: true }),
      plant(state, "rose", 5, { growth_units: 4 }),
      plant(state, "peony", 6),
      plant(state, "rose", 7, { ...bloomed, growth_units: 5 }),
      plant(state, "moonflower", 8),
    ];
    return state;
  }
  it("counts what is left for each member and orders the list", () => {
    const plan = todayPlan(garden(1));
    expect(plan).toMatchObject({ you: 3, partner: 3, allTended: false });
    // Partner-cared Tulip first, then at-risk Roses by growth, then waiting and later.
    expect(plan.rows.map((row) => row.plant.flower.spot)).toEqual([3, 5, 2, 4, 8]);
    expect(plan.next?.plant.flower.spot).toBe(3);
  });
  it("mirrors the counts for the other member", () => {
    const plan = todayPlan(garden(2));
    expect(plan).toMatchObject({ you: 3, partner: 3 });
    // Marigold is the pair member 2 would complete.
    expect(plan.next?.plant.flower.spot).toBe(4);
    expect(plan.rows.find((row) => row.plant.flower.spot === 3)?.dueForYou).toBe(false);
  });
  it("counts an open Moonflower for both", () => {
    const state = garden(1);
    state.moonflower_open = true;
    expect(todayPlan(state)).toMatchObject({ you: 4, partner: 4 });
  });
  it("offers the first empty spot when nothing is due and a seed is available", () => {
    const state = garden(1);
    for (const p of state.plants) p.member1_submitted = true;
    const plan = todayPlan(state);
    expect(plan.next).toBeNull();
    expect(plan.you).toBe(0);
    expect(plan.plantSpot).toBe(9);
  });
  it("offers no planting when every seed is at its limit or no spot is empty", () => {
    const state = garden(1);
    // Rose, Tulip, Marigold and Moonflower each already have a growing flower.
    state.catalog = state.catalog.map((c) => ({ ...c, unfinished_limit: 1 }));
    expect(todayPlan(state).plantSpot).toBeNull();
    const full = gardenFixture();
    full.plants = Array.from({ length: 12 }, (_, i) =>
      plant(full, "rose", i + 1, { ...bloomed, growth_units: 5 }),
    );
    expect(todayPlan(full).plantSpot).toBeNull();
  });
  it("is all tended only when both cared for everything and nothing opens later", () => {
    const state = garden(1);
    const moonflower = state.plants.find((p) => p.flower.type_key === "moonflower")!;
    for (const p of state.plants)
      if (p !== moonflower) {
        p.member1_submitted = true;
        p.member2_submitted = true;
      }
    expect(todayPlan(state)).toMatchObject({ you: 0, partner: 0, allTended: false });
    expect(todayPlan(state).rows.map((row) => row.later)).toEqual([true]);
    state.moonflower_open = true;
    moonflower.member1_submitted = true;
    moonflower.member2_submitted = true;
    expect(todayPlan(state)).toMatchObject({ you: 0, partner: 0, allTended: true, rows: [] });
  });
});

it("excludes mature Hydrangea choices from all daily totals and risk cues", () => {
  const state = gardenFixture();
  state.plants = [plant(state, "hydrangea", 2, { ...bloomed, growth_units: 7, m2: true })];
  expect(todayPlan(state)).toMatchObject({ you: 0, partner: 0, rows: [], next: null, allTended: true });
  expect(careStatus(state.plants[0], item(state, "hydrangea"), state)).toBeNull();
});
