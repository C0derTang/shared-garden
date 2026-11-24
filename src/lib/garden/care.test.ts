import { describe, expect, it } from "vitest";
import { careStatus, LEGACY_CARE, NO_DECAY, todayPlan, type CarePlant } from "./care";

const plant = (type: string, spot: number, options: { units?: number; bloomed?: boolean; m1?: boolean; m2?: boolean } = {}): CarePlant => ({
  flower: { type_key: type, spot, growth_units: options.units ?? 0, first_bloom_at: options.bloomed ? "2026-11-01T12:00:00Z" : null, fulfilled_at: null },
  member1_submitted: options.m1 ?? false,
  member2_submitted: options.m2 ?? false,
});
const item = (type: string, target = 5) => ({ type_key: type, growth_target: target });
const me = { member_id: 1 as const, moonflower_open: false };

describe("shared care rules", () => {
  it("warns of decay only under the legacy rules", () => {
    const rose = plant("rose", 1, { units: 2 });
    expect(careStatus(rose, item("rose"), me, LEGACY_CARE)?.cue).toBe("at-risk");
    expect(careStatus(rose, item("rose"), me, NO_DECAY)?.cue).toBeNull();
  });

  it("keeps the shared cues in the new garden", () => {
    expect(careStatus(plant("rose", 1, { m2: true }), item("rose"), me, NO_DECAY)?.cue).toBe("partner-cared");
    expect(careStatus(plant("rose", 1, { units: 4, m1: true, m2: true }), item("rose"), me, NO_DECAY)?.cue).toBe("blooms");
    const moon = careStatus(plant("moonflower", 2), item("moonflower"), me, NO_DECAY);
    expect(moon).toMatchObject({ later: true, dueForYou: false });
    expect(careStatus(plant("rose", 1, { bloomed: true }), item("rose"), me, NO_DECAY)).toBeNull();
    expect(careStatus(plant("cactus", 1, { bloomed: true }), item("cactus", 10), me, NO_DECAY)).not.toBeNull();
  });

  it("plans today without needing the legacy catalog limits", () => {
    const state = {
      ...me,
      catalog: [item("rose"), item("tulip", 7)],
      plants: [plant("rose", 1, { m2: true }), plant("tulip", 3)],
      garden: { spot_capacity: 12 },
    };
    const plan = todayPlan(state, { canPlant: true, rules: NO_DECAY });
    expect(plan.next?.plant.flower.spot).toBe(1);
    expect(plan.plantSpot).toBe(2);
    expect(todayPlan(state, { canPlant: false }).plantSpot).toBeNull();
    const roseOnly = todayPlan(state, { canPlant: false, rules: NO_DECAY, takesPart: (p) => p.flower.type_key === "rose" });
    expect(roseOnly.rows.map((row) => row.plant.flower.type_key)).toEqual(["rose"]);
  });
});
