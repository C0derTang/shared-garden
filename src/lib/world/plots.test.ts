import { describe, expect, it } from "vitest";
import { spotPosition } from "./layout";
import { bedOfSpot, bedSpotOrder, plotOrder, spotRow } from "./plots";

describe("plot reading order", () => {
  it("lists every spot exactly once, bed by bed in the order the beds opened", () => {
    const order = plotOrder(36);
    expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
    expect(order.map(bedOfSpot)).toEqual([...Array(12).fill(0), ...Array(12).fill(1), ...Array(12).fill(2)]);
  });

  it("reads each bed row by row, from its back row to its front, left to right", () => {
    for (const bed of [0, 1, 4]) {
      const spots = bedSpotOrder(bed);
      expect(spots).toHaveLength(12);
      for (let i = 1; i < spots.length; i += 1) {
        const previous = spots[i - 1]!;
        const spot = spots[i]!;
        expect(spotRow(spot)).toBeGreaterThanOrEqual(spotRow(previous));
        if (spotRow(spot) === spotRow(previous)) expect(spotPosition(spot).position[0]).toBeGreaterThan(spotPosition(previous).position[0]);
      }
      // Rows run from the back of the bed (further from the camera, smaller z) to the front.
      const first = spotPosition(spots[0]!).position[2];
      const last = spotPosition(spots.at(-1)!).position[2];
      expect(first).toBeLessThan(last);
      expect(new Set(spots.map(spotRow)).size).toBeGreaterThan(2);
    }
  });

  it("stops at the garden's capacity", () => {
    expect(plotOrder(12)).toHaveLength(12);
    expect(plotOrder(18).every((spot) => spot <= 18)).toBe(true);
    expect(plotOrder(18)).toHaveLength(18);
    expect(plotOrder(0)).toEqual([]);
  });
});
