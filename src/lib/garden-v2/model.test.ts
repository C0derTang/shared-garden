import { expect, it } from "vitest";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";
import { canEditAt, daisyAskedBy, daisyQuestionFor, emptySpots, moodPick, parseGardenState, type CustomQuestion } from "./model";

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

const custom = (patch: Partial<CustomQuestion> = {}): CustomQuestion => ({
  id: 9,
  asker_id: 2,
  addressee_id: 1,
  prompt: "A synthetic question?",
  revision: 2,
  question_key: "custom-9-r2",
  created_at: "2026-11-02T17:00:00Z",
  updated_at: "2026-11-02T17:05:00Z",
  locked: false,
  ...patch,
});
const daily = { garden_day: "2026-11-02", ordinal: 1, question_id: "light-001", category: "light" as const, prompt: "A daily question?", assigned_at: "2026-11-02T12:00:00Z" };

it("answers the partner's custom question, else the daily one (#212)", () => {
  const plant = { daisy_question: daily, daisy_custom_questions: [custom()] };
  expect(daisyQuestionFor(plant, 1)).toEqual({ kind: "custom", key: "custom-9-r2", prompt: "A synthetic question?", askedBy: 2 });
  expect(daisyQuestionFor(plant, 2)).toEqual({ kind: "daily", key: "light-001", prompt: "A daily question?", category: "light" });
  expect(daisyAskedBy(plant, 2)?.id).toBe(9);
  expect(daisyAskedBy(plant, 1)).toBeNull();
  expect(daisyQuestionFor({ daisy_question: null, daisy_custom_questions: [] }, 1)).toBeNull();
});
it("validates custom questions and answered questions in the snapshot", () => {
  const ok = v2GardenFixture();
  ok.plants[0].flower.type_key = "daisy";
  ok.plants[0].daisy_custom_questions = [custom()];
  ok.plants[0].entries[0] = { ...v2EntryFixture(), daisy_assignment_day: "2026-11-02", daisy_custom_question_id: 9, question: { kind: "custom", prompt: "Q?", asked_by: 2 } };
  expect(() => parseGardenState(ok)).not.toThrow();
  const bad: ((s: ReturnType<typeof v2GardenFixture>) => void)[] = [
    (s) => { s.plants[0].daisy_custom_questions = [custom({ addressee_id: 2 })]; },
    (s) => { s.plants[0].daisy_custom_questions = [custom({ question_key: "light-001" })]; },
    (s) => { s.plants[0].daisy_custom_questions = [custom({ revision: 0 })]; },
    (s) => { (s.plants[0] as { daisy_custom_questions: unknown }).daisy_custom_questions = null; },
    (s) => { s.plants[0].entries[0].question = { kind: "custom", prompt: "Q?", asked_by: 3 as 1 }; },
    (s) => { s.plants[0].entries[0].question = { kind: "daily", prompt: "Q?", category: "odd" as "light", question_id: "x" }; },
    (s) => { s.plants[0].entries[0].daisy_custom_question_id = -1; },
  ];
  for (const mutate of bad) {
    const state = v2GardenFixture();
    mutate(state);
    expect(() => parseGardenState(state)).toThrow("Invalid garden response");
  }
});
