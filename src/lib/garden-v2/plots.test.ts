import { describe, expect, it } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { plotOrder } from "@/lib/world/plots";
import type { FlowerType, GardenState, Plant } from "./model";
import { gardenPlots, plotGrowth, waitingOnYou, waitsOnYou } from "./plots";

function garden() {
  const state = v2GardenFixture();
  const rose = state.plants[0]!;
  rose.flower.growth_units = 3;
  rose.member1_submitted = false;
  rose.member2_submitted = true;
  return state;
}

describe("gardenPlots", () => {
  it("lists every spot of the open beds in reading order, planted and empty", () => {
    const state = garden();
    state.garden.spot_capacity = 24;
    const plots = gardenPlots(state, "Sam");
    expect(plots.map((plot) => plot.spot)).toEqual(plotOrder(24));
    expect(plots.filter((plot) => plot.plant)).toHaveLength(1);
    expect(plots.filter((plot) => plot.bed === 2)).toHaveLength(12);
  });

  it("names a flower by type and growth, with a heart while it waits on your care", () => {
    const plots = gardenPlots(garden(), "Sam");
    const rose = plots.find((plot) => plot.spot === 1)!;
    expect(rose).toMatchObject({ label: "rose · 3 of 5 ♡ · bed 1", bed: 1 });
    expect(rose.ariaLabel).toBe("rose, opening, 3 of 5. Your care is open; Sam cared today. Bed 1");
    expect(plots.find((plot) => plot.spot === 2)).toMatchObject({ plant: null, label: "empty spot · bed 1", ariaLabel: "Empty spot, bed 1" });
  });

  it("says a bloomed flower is in bloom and drops the heart once you have cared", () => {
    const state = garden();
    const rose = state.plants[0]!;
    rose.flower.growth_units = 5;
    rose.flower.first_bloom_at = state.server_now;
    rose.member1_submitted = true;
    expect(plotGrowth(rose, state)).toBe("in bloom");
    const plot = gardenPlots(state, "Sam").find((candidate) => candidate.spot === 1)!;
    expect(plot.label).toBe("rose · in bloom · bed 1");
  });

  it("shows the heart whenever your care is open, whether or not your partner has cared (#214)", () => {
    const state = garden();
    const rose = state.plants[0]!;
    rose.member2_submitted = false;
    expect(gardenPlots(state, "Sam").find((plot) => plot.spot === 1)!.label).toBe("rose · 3 of 5 ♡ · bed 1");
    // Once you have cared it goes, even if your partner has not.
    rose.member1_submitted = true;
    expect(gardenPlots(state, "Sam").find((plot) => plot.spot === 1)!.label).toBe("rose · 3 of 5 · bed 1");
  });
});

describe("waitingOnYou (#214)", () => {
  /** A garden of one plant per case, all on spots 1.., member 1 signed in. */
  function gardenOf(cases: { type: FlowerType; you?: boolean; partner?: boolean; bloomed?: boolean; fulfilled?: boolean; units?: number }[], moonflowerOpen = false) {
    const state: GardenState = v2GardenFixture();
    const template = state.plants[0]!;
    state.moonflower_open = moonflowerOpen;
    state.garden.spot_capacity = 24;
    state.plants = cases.map((c, i): Plant => ({
      ...structuredClone(template),
      flower: {
        ...template.flower,
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
        spot: cases.length - i,
        type_key: c.type,
        growth_units: c.units ?? 1,
        first_bloom_at: c.bloomed || c.fulfilled ? state.server_now : null,
        fulfilled_at: c.fulfilled ? state.server_now : null,
      },
      member1_submitted: c.you ?? false,
      member2_submitted: c.partner ?? false,
    }));
    return state;
  }
  const types = (state: GardenState) => waitingOnYou(state).map((plant) => plant.flower.type_key);

  it("marks every growing flower whose care is open for you, sprouts included, in spot order", () => {
    const state = gardenOf([{ type: "rose", units: 0 }, { type: "tulip", partner: true }, { type: "daisy", units: 4 }]);
    expect(types(state)).toEqual(["daisy", "tulip", "rose"]);
    expect(waitingOnYou(state).map((plant) => plant.flower.spot)).toEqual([1, 2, 3]);
  });

  it("drops a flower once you have cared, whatever your partner did", () => {
    expect(types(gardenOf([{ type: "rose", you: true }, { type: "tulip", you: true, partner: true }, { type: "daisy", partner: true }]))).toEqual(["daisy"]);
  });

  it("never marks the Peony, a bloomed flower that needs no more care, or a fulfilled Dandelion", () => {
    const state = gardenOf([{ type: "peony" }, { type: "rose", bloomed: true }, { type: "dandelion", fulfilled: true }, { type: "dandelion", bloomed: true }]);
    expect(types(state)).toEqual([]);
  });

  it("keeps marking a bloomed Cactus, which keeps its check-ins", () => {
    expect(types(gardenOf([{ type: "cactus", bloomed: true }, { type: "cactus", bloomed: true, you: true }]))).toEqual(["cactus"]);
  });

  it("marks a Moonflower only once its 10 p.m. window opens", () => {
    const cases = [{ type: "moonflower" as const }, { type: "moonflower" as const, you: true }];
    expect(types(gardenOf(cases, false))).toEqual([]);
    expect(types(gardenOf(cases, true))).toEqual(["moonflower"]);
  });

  it("follows the signed-in member", () => {
    const state = gardenOf([{ type: "rose", you: true }, { type: "tulip", partner: true }]);
    expect(types(state)).toEqual(["tulip"]);
    state.member_id = 2;
    expect(types(state)).toEqual(["rose"]);
  });

  it("agrees with the hidden plot list's chip heart and accessible names", () => {
    const state = gardenOf([
      { type: "rose" },
      { type: "tulip", you: true },
      { type: "daisy", you: true, partner: true },
      { type: "marigold", partner: true },
      { type: "peony" },
      { type: "moonflower" },
      { type: "hydrangea", bloomed: true },
      { type: "cactus", bloomed: true },
    ]);
    const waiting = new Set(waitingOnYou(state).map((plant) => plant.flower.spot));
    for (const plot of gardenPlots(state, "Sam")) {
      if (!plot.plant) continue;
      expect(waitsOnYou(plot.plant, state)).toBe(waiting.has(plot.spot));
      expect(plot.label.includes("♡"), plot.label).toBe(waiting.has(plot.spot));
      expect(plot.ariaLabel.includes("Your care is open"), plot.ariaLabel).toBe(waiting.has(plot.spot));
    }
    expect(waitingOnYou(state).map((plant) => plant.flower.type_key)).toEqual(["cactus", "marigold", "rose"]);
  });
});
