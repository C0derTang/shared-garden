import { expect, it } from "vitest";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";
import { canEditAt, emptySpots, moodPick, parseGardenState } from "./model";

it("accepts an authoritative new-garden snapshot with seeds and no legacy limits", () => {
  const state = parseGardenState(v2GardenFixture());
  expect(state.plants[0].flower.seed).toBe(4503599627370495);
  expect(state.catalog).toHaveLength(13);
  expect(state.catalog[0]).not.toHaveProperty("unfinished_limit");
});
it("rejects malformed or unsafe values before rendering", () => {
  const cases: ((s: ReturnType<typeof v2GardenFixture>) => void)[] = [
    (s) => { s.plants[0].flower.seed = -1; },
    (s) => { s.plants[0].flower.seed = 2 ** 53; },
    (s) => { s.plants[0].flower.spot = 13; },
    (s) => { s.plants[0].flower.growth_units = 6; },
    (s) => { s.plants[0].flower.shared_wish = "Not a Dandelion"; },
    (s) => { s.plants[0].flower.fulfilled_at = s.server_now; },
    (s) => { (s.plants[0].flower as { planted_by: unknown }).planted_by = null; },
    (s) => { s.garden.spot_capacity = 13; },
    (s) => { s.garden.next_spot = 1; },
    (s) => { s.catalog.pop(); },
    (s) => { s.plants.push(structuredClone(s.plants[0])); },
    (s) => { (s.plants[0] as { hydrangea_picks: unknown }).hydrangea_picks = [{ mood: "purple" }, null]; },
    (s) => { (s as { member_id: unknown }).member_id = 3; },
  ];
  for (const mutate of cases) {
    const state = v2GardenFixture();
    mutate(state);
    expect(() => parseGardenState(state)).toThrow("Invalid garden response");
  }
});
it("validates Hydrangea picks like the server", () => {
  expect(moodPick({ mood: "calm", mood2: "joyful", note: "Mixed" })).toEqual({ mood: "calm", mood2: "joyful", note: "Mixed" });
  expect(moodPick({ mood: "other", note: "Quiet" })).toEqual({ mood: "other", note: "Quiet" });
  expect(moodPick({ mood: "other" })).toBeNull();
  expect(moodPick({ mood: "calm", mood2: "calm" })).toBeNull();
});
it("mirrors the author-only 30-minute same-day edit window", () => {
  const state = v2GardenFixture();
  const entry = v2EntryFixture();
  expect(canEditAt(entry, state, Date.parse("2026-11-02T17:30:00Z"))).toBe(true);
  expect(canEditAt(entry, state, Date.parse("2026-11-02T17:30:00.001Z"))).toBe(false);
  expect(canEditAt(entry, { ...state, member_id: 2 }, Date.parse("2026-11-02T17:10:00Z"))).toBe(false);
});
it("lists empty visible spots", () => {
  expect(emptySpots(v2GardenFixture())).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
