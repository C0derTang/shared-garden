import { expect, it } from "vitest";
import { parseGardenState, seedAvailability, canEditAt } from "./model";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";

it("accepts the complete server snapshot and rejects unsafe progress or duplicate spots", () => {
  const raw = gardenFixture();
  expect(parseGardenState(raw).plants[0].flower.type_key).toBe("cactus");
  expect(() =>
    parseGardenState({ ...raw, plants: [raw.plants[0], raw.plants[0]] }),
  ).toThrow();
  raw.plants[0].flower.growth_units = 11;
  expect(() => parseGardenState(raw)).toThrow();
});
it("keeps permanent Cactus unavailable and releases capacity only for recorded blooms", () => {
  const state = gardenFixture();
  state.plants[0].flower.first_bloom_at = state.server_now;
  expect(seedAvailability(state.catalog[0], state).available).toBe(false);
  const rose = state.catalog[1];
  state.plants.push(
    ...[2, 3, 4].map((spot) => ({
      ...state.plants[0],
      flower: {
        ...state.plants[0].flower,
        id: `00000000-0000-4000-8000-00000000000${spot}`,
        spot,
        type_key: "rose" as const,
        growth_units: 5,
        first_bloom_at: null,
      },
    })),
  );
  expect(seedAvailability(rose, state).available).toBe(false);
  state.plants[1].flower.first_bloom_at = state.server_now;
  expect(seedAvailability(rose, state).remaining).toBe(1);
  expect(seedAvailability(state.catalog[4], state).reason).toMatch(/1.*bloom/);
});
it("allows only the author's same-day live edit snapshot through its effective deadline", () => {
  const entry = entryFixture();
  const state = gardenFixture();
  expect(canEditAt(entry, state, Date.parse(entry.edit_deadline!))).toBe(true);
  expect(canEditAt(entry, state, Date.parse(entry.edit_deadline!) + 1)).toBe(
    false,
  );
  expect(
    canEditAt(
      { ...entry, edit_deadline_inclusive: false },
      state,
      Date.parse(entry.edit_deadline!),
    ),
  ).toBe(false);
  expect(
    canEditAt({ ...entry, author_id: 2 }, state, Date.parse(state.server_now)),
  ).toBe(false);
  expect(
    canEditAt(
      { ...entry, garden_day: "2026-09-16" },
      state,
      Date.parse(state.server_now),
    ),
  ).toBe(false);
});
it("accepts fulfillment only as a complete authoritative bloomed Dandelion fact", () => {
  const state = gardenFixture();
  const flower = state.plants[0].flower;
  flower.fulfilled_at = state.server_now;
  flower.fulfilled_by = 2;
  expect(() => parseGardenState(state)).toThrow();
  flower.type_key = "dandelion";
  expect(() => parseGardenState(state)).toThrow();
  flower.first_bloom_at = state.server_now;
  expect(parseGardenState(state)).toBe(state);
  flower.fulfilled_by = null;
  expect(() => parseGardenState(state)).toThrow();
});
