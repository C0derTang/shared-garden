import { describe, expect, it } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { plotOrder } from "@/lib/world/plots";
import { gardenPlots, plotGrowth } from "./plots";

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

  it("names a flower by type and growth, with a heart when your partner cared and you have not", () => {
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
});
