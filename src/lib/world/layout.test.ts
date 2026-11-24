import { describe, expect, it } from "vitest";
import {
  BED_RADIUS,
  SPOTS_PER_BED,
  WATER_LEVEL,
  bedAt,
  bedCountFor,
  layoutPlantingSpots,
  shorelineZ,
  spotCapacityFor,
  spotPosition,
  terrainHeight,
} from "./layout";

describe("planting spot layout", () => {
  it("rounds capacity up to whole beds of twelve", () => {
    expect(bedCountFor(0)).toBe(1);
    expect(bedCountFor(12)).toBe(1);
    expect(bedCountFor(13)).toBe(2);
    expect(layoutPlantingSpots(5)).toHaveLength(SPOTS_PER_BED);
    expect(layoutPlantingSpots(25)).toHaveLength(36);
  });

  it("numbers spots from one, in bed order", () => {
    const spots = layoutPlantingSpots(24);
    expect(spots.map((s) => s.spot)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    expect(spots[11]!.bed).toBe(0);
    expect(spots[12]!.bed).toBe(1);
  });

  it("keeps a spot's position stable as beds open", () => {
    const before = layoutPlantingSpots(12)[4]!.position;
    const after = layoutPlantingSpots(120)[4]!.position;
    expect(after).toEqual(before);
  });

  it("places every spot inside its bed", () => {
    for (const spot of layoutPlantingSpots(96)) {
      const bed = bedAt(spot.bed);
      const d = Math.hypot(spot.position[0] - bed.center[0], spot.position[2] - bed.center[2]);
      expect(d).toBeLessThan(BED_RADIUS);
    }
  });

  it("keeps spots in a bed apart from each other", () => {
    const spots = layoutPlantingSpots(12);
    for (let i = 0; i < spots.length; i += 1) {
      for (let j = i + 1; j < spots.length; j += 1) {
        const a = spots[i]!.position;
        const b = spots[j]!.position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.25);
      }
    }
  });

  it("never overlaps beds and keeps them on dry land", () => {
    const beds = Array.from({ length: 40 }, (_, i) => bedAt(i));
    for (let i = 0; i < beds.length; i += 1) {
      const bed = beds[i]!;
      expect(bed.center[2] - BED_RADIUS).toBeGreaterThan(shorelineZ(bed.center[0]));
      expect(bed.center[1]).toBeGreaterThan(WATER_LEVEL);
      for (let j = i + 1; j < beds.length; j += 1) {
        const other = beds[j]!;
        expect(Math.hypot(bed.center[0] - other.center[0], bed.center[2] - other.center[2])).toBeGreaterThan(BED_RADIUS * 2);
      }
    }
  });

  it("grows the garden outward from the middle, nearest rows first", () => {
    expect(bedAt(0).center[0]).toBe(0);
    expect(bedAt(0).row).toBe(0);
    const firstFour = [0, 1, 2, 3].map((i) => Math.abs(bedAt(i).center[0]));
    expect(Math.max(...firstFour)).toBeLessThan(7);
  });

  it("rejects invalid spot identifiers", () => {
    expect(() => spotPosition(0)).toThrow(RangeError);
    expect(() => spotPosition(1.5)).toThrow(RangeError);
  });
});

describe("spotCapacityFor", () => {
  it("shows one bed for an empty garden", () => {
    expect(spotCapacityFor([])).toBe(12);
  });

  it("opens a new bed once every shown spot is filled", () => {
    expect(spotCapacityFor(Array.from({ length: 11 }, (_, i) => i + 1))).toBe(12);
    expect(spotCapacityFor(Array.from({ length: 12 }, (_, i) => i + 1))).toBe(24);
  });

  it("covers the highest occupied spot", () => {
    expect(spotCapacityFor([30])).toBe(36);
  });
});

describe("terrainHeight", () => {
  it("is level meadow on land and below the water past the shore", () => {
    expect(Math.abs(terrainHeight(0, 8))).toBeLessThan(0.1);
    expect(terrainHeight(0, shorelineZ(0) - 4)).toBeLessThan(WATER_LEVEL);
  });
});
