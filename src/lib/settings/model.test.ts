import { expect, it } from "vitest";
import { parseSettings, parseSettingChange, guideStep } from "./model";
import { gardenFixture } from "@/test/garden-fixture";

it("allows only one presentation/preference field and never actor or activity claims", () => {
  expect(parseSettingChange({ gentle_motion: false })).toEqual({ gentle_motion: false });
  expect(parseSettingChange({ guide: "open" })).toEqual({ guide: "open" });
  for (const value of [null, [], {}, { guide: "done" }, { guide: "open", member_id: 2 }, { gentle_motion: "false" }, { cactus_done: true }, { guide: "open", gentle_motion: false }])
    expect(() => parseSettingChange(value)).toThrow();
});
it("validates settings and only returns the safe own-member projection", () => {
  expect(parseSettings({ revision: 2, guide: "skipped", gentle_motion: false, secret: "omit" })).toEqual({ revision: 2, guide: "skipped", gentle_motion: false });
  for (const value of [{ revision: -1, guide: "open", gentle_motion: true }, { revision: 0, guide: "bad", gentle_motion: false }, { revision: 0, guide: "open" }]) expect(() => parseSettings(value)).toThrow();
});
it.each([1, 2] as const)("guides either member arriving first through real Cactus then intentional planting", (member) => {
  const garden = gardenFixture(); garden.member_id = member;
  expect(guideStep(garden)).toMatchObject({ kind: "cactus", spot: 1 });
  garden.tutorial_facts = { cactus_checked_in: true, rose_noted: false };
  expect(guideStep(garden)).toMatchObject({ kind: "plant", spot: 2 });
});
it("uses own retained action facts, never a partner care flag or client presentation status", () => {
  const garden = gardenFixture(); garden.plants[0].member2_submitted = true;
  expect(guideStep(garden).kind).toBe("cactus");
  garden.tutorial_facts = { cactus_checked_in: true, rose_noted: true };
  expect(guideStep(garden).kind).toBe("ready");
});
it("selects the first existing growing Rose by spot for a late visitor, even at the cap", () => {
  const garden = gardenFixture(); garden.tutorial_facts = { cactus_checked_in: true, rose_noted: false };
  for (const spot of [5, 3, 8]) garden.plants.push({ ...garden.plants[0], flower: { ...garden.plants[0].flower, id: String(spot), spot, type_key: "rose" } });
  expect(guideStep(garden)).toMatchObject({ kind: "rose", spot: 3 });
});
it("does not require watering permanent Roses or reset retained own progress at rollover", () => {
  const garden = gardenFixture(); garden.tutorial_facts = { cactus_checked_in: true, rose_noted: false };
  garden.plants.push({ ...garden.plants[0], flower: { ...garden.plants[0].flower, id: "rose", spot: 2, type_key: "rose", first_bloom_at: garden.server_now } });
  expect(guideStep(garden)).toMatchObject({ kind: "blooms", spot: 2 });
  garden.garden_day = "2026-09-19";
  garden.tutorial_facts.rose_noted = true;
  expect(guideStep(garden).kind).toBe("ready");
});

it.each([1, 2] as const)("takes a late-arriving member %s directly to the partner’s existing Rose before their first Cactus check-in", (member) => {
  const garden = gardenFixture(); garden.member_id = member;
  garden.plants.push({ ...structuredClone(garden.plants[0]), flower: { ...garden.plants[0].flower, type_key: "rose", id: "existing-rose", spot: 2, planted_by: member === 1 ? 2 : 1 } });
  expect(guideStep(garden)).toEqual({ kind: "rose", spot: 2 });
  garden.tutorial_facts.rose_noted = true;
  expect(guideStep(garden)).toEqual({ kind: "cactus", spot: 1 });
  garden.tutorial_facts.cactus_checked_in = true;
  expect(guideStep(garden)).toEqual({ kind: "ready" });
});
