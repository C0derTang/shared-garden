import { moodPick, type MoodPick } from "@/lib/garden/moods";

/**
 * New-garden (v2) data model. Independent of the legacy garden UI: the server
 * snapshot from `v2_current_garden_state` is validated here before rendering.
 */
export const flowerTypes = [
  "rose",
  "cactus",
  "tulip",
  "marigold",
  "daisy",
  "hydrangea",
  "sunflower",
  "snapdragon",
  "moonflower",
  "bluebell",
  "dandelion",
  "forget-me-not",
  "peony",
] as const;
export type FlowerType = (typeof flowerTypes)[number];

// Hydrangea moods are shared with the legacy garden (one palette, one rule).
export { moodKeys, moodPick, MOOD_NOTE_LIMIT, OTHER_MOOD, type MoodKey, type MoodPick } from "@/lib/garden/moods";

export type ClockState = {
  server_now: string;
  garden_day: string;
  day_starts_at: string;
  next_rollover_at: string;
  moonflower_open: boolean;
};
/** Only identity and growth target apply in the new garden: no limits or unlocks. */
export type CatalogItem = {
  type_key: FlowerType;
  display_name: string;
  action_label: string;
  growth_target: number;
};
/** The question a Daisy answer responded to: the shared daily one or a partner's own (#212). */
export type EntryQuestion =
  | { kind: "daily"; prompt: string; category: "light" | "deeper"; question_id: string }
  | { kind: "custom"; prompt: string; asked_by: 1 | 2 };
export type Entry = {
  id: number;
  flower_id: string;
  author_id: 1 | 2;
  garden_day: string;
  original_posted_at: string;
  updated_at: string;
  payload: Record<string, string>;
  daisy_assignment_day: string | null;
  /** The custom question this Daisy answer is bound to, if any (#212). */
  daisy_custom_question_id?: number | null;
  /** Resolved question for a Daisy answer; absent when not loaded. */
  question?: EntryQuestion | null;
  edit_deadline?: string;
  edit_deadline_inclusive?: boolean;
  can_edit?: boolean;
};
export type Flower = {
  id: string;
  garden_id: 1;
  type_key: FlowerType;
  spot: number;
  /** Stable per-flower appearance seed, 0 to 2^53 - 1. */
  seed: number;
  planted_at: string;
  planted_day: string;
  planted_by: 1 | 2;
  shared_wish: string | null;
  growth_units: number;
  first_bloom_at: string | null;
  first_bloom_day: string | null;
  fulfilled_at: string | null;
  fulfilled_by: 1 | 2 | null;
};
export type DaisyQuestion = {
  garden_day: string;
  ordinal: number;
  question_id: string;
  category: "light" | "deeper";
  prompt: string;
  assigned_at: string;
};
/** A member's own question for the other on a Daisy today (#212, decision 0068). */
export type CustomQuestion = {
  id: number;
  asker_id: 1 | 2;
  addressee_id: 1 | 2;
  prompt: string;
  revision: number;
  /** What an answer to this exact revision carries as its `question_id`. */
  question_key: string;
  created_at: string;
  updated_at: string;
  /** The addressee has answered: the question stays as asked. */
  locked: boolean;
};
export const DAISY_QUESTION_LIMIT = 300;
export type Plant = ClockState & {
  flower: Flower;
  entries: Entry[];
  /** Latest saved Hydrangea pick per fixed member slot. */
  hydrangea_picks: [MoodPick | null, MoodPick | null];
  daisy_question: DaisyQuestion | null;
  /** Today's live custom questions on a Daisy (empty for other flowers). */
  daisy_custom_questions: CustomQuestion[];
  member1_submitted: boolean;
  member2_submitted: boolean;
};
export type GardenState = ClockState & {
  member_id: 1 | 2;
  garden: {
    id: 1;
    initialized_at: string;
    next_spot: number;
    spot_capacity: number;
    last_settled_day: string;
    current_streak: number;
    longest_streak: number;
    qualifying_days: number;
  };
  catalog: CatalogItem[];
  plants: Plant[];
};
export type GardenResult = { state: GardenState | null; error: string | null; saved?: boolean };
export type GardenCommand =
  | { kind: "plant"; type: FlowerType; spot: number; wish?: string }
  | { kind: "submit"; flowerId: string; payload: Record<string, string> }
  | { kind: "fulfillDandelion"; flowerId: string }
  | { kind: "edit"; entryId: number; payload: Record<string, string> }
  | { kind: "askDaisy"; flowerId: string; prompt: string }
  | { kind: "removeDaisyQuestion"; flowerId: string };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid garden response");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid garden response");
  return value;
}
function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid garden response");
}
const positive = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nonNegative = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
const member = (v: unknown) => v === 1 || v === 2;
const isType = (v: unknown): v is FlowerType => flowerTypes.includes(v as FlowerType);

function clock(value: Record<string, unknown>) {
  assert(
    timestamp(value.server_now) &&
      timestamp(value.day_starts_at) &&
      timestamp(value.next_rollover_at) &&
      typeof value.garden_day === "string" &&
      typeof value.moonflower_open === "boolean",
  );
}

const QUESTION_KEY = /^custom-[1-9]\d{0,17}-r[1-9]\d{0,8}$/;

export function parseEntryQuestion(value: unknown): EntryQuestion | null {
  if (value === null || value === undefined) return null;
  const q = object(value);
  assert(typeof q.prompt === "string");
  if (q.kind === "daily") assert(["light", "deeper"].includes(q.category as string) && typeof q.question_id === "string");
  else assert(q.kind === "custom" && member(q.asked_by));
  return q as EntryQuestion;
}

function parseCustomQuestions(value: unknown) {
  for (const item of array(value)) {
    const q = object(item);
    assert(
      positive(q.id) &&
        member(q.asker_id) &&
        member(q.addressee_id) &&
        q.asker_id !== q.addressee_id &&
        typeof q.prompt === "string" &&
        positive(q.revision) &&
        typeof q.question_key === "string" &&
        QUESTION_KEY.test(q.question_key) &&
        timestamp(q.created_at) &&
        timestamp(q.updated_at) &&
        typeof q.locked === "boolean",
    );
  }
}

export function parseEntries(value: unknown): Entry[] {
  for (const item of array(value)) {
    const e = object(item);
    assert(
      positive(e.id) &&
        typeof e.flower_id === "string" &&
        member(e.author_id) &&
        typeof e.garden_day === "string" &&
        timestamp(e.original_posted_at) &&
        timestamp(e.updated_at) &&
        (e.daisy_assignment_day === null || typeof e.daisy_assignment_day === "string") &&
        (e.daisy_custom_question_id === undefined || e.daisy_custom_question_id === null || positive(e.daisy_custom_question_id)),
    );
    parseEntryQuestion(e.question);
    assert(Object.values(object(e.payload)).every((v) => typeof v === "string"));
    if (e.edit_deadline !== undefined)
      assert(timestamp(e.edit_deadline) && typeof e.can_edit === "boolean" && typeof e.edit_deadline_inclusive === "boolean");
  }
  return value as Entry[];
}

function parseFlower(value: unknown, catalog: Record<string, unknown>[], capacity: number) {
  const f = object(value);
  const c = catalog.find((item) => item.type_key === f.type_key);
  assert(
    c &&
      typeof f.id === "string" &&
      f.garden_id === 1 &&
      positive(f.spot) &&
      (f.spot as number) <= capacity &&
      nonNegative(f.seed) &&
      timestamp(f.planted_at) &&
      typeof f.planted_day === "string" &&
      member(f.planted_by) &&
      nonNegative(f.growth_units) &&
      (f.growth_units as number) <= (c.growth_target as number) &&
      (f.first_bloom_at === null || timestamp(f.first_bloom_at)) &&
      (f.first_bloom_day === null || typeof f.first_bloom_day === "string") &&
      (f.first_bloom_at === null) === (f.first_bloom_day === null) &&
      (f.type_key === "dandelion" ? typeof f.shared_wish === "string" : f.shared_wish === null),
  );
  assert(
    (f.fulfilled_at === null && f.fulfilled_by === null) ||
      (f.type_key === "dandelion" &&
        f.first_bloom_at !== null &&
        timestamp(f.fulfilled_at) &&
        member(f.fulfilled_by) &&
        Date.parse(f.fulfilled_at as string) >= Date.parse(f.first_bloom_at as string)),
  );
  return f;
}

/** Validate consumed values before rendering artwork or allocating visible spots. */
export function parseGardenState(value: unknown): GardenState {
  const state = object(value);
  clock(state);
  assert(member(state.member_id));
  const garden = object(state.garden);
  assert(
    garden.id === 1 &&
      timestamp(garden.initialized_at) &&
      typeof garden.last_settled_day === "string" &&
      positive(garden.spot_capacity) &&
      (garden.spot_capacity as number) % 12 === 0 &&
      positive(garden.next_spot) &&
      (garden.next_spot as number) <= (garden.spot_capacity as number) &&
      nonNegative(garden.current_streak) &&
      nonNegative(garden.longest_streak) &&
      nonNegative(garden.qualifying_days),
  );
  const catalog = array(state.catalog).map(object);
  assert(catalog.length === flowerTypes.length && new Set(catalog.map((c) => c.type_key)).size === flowerTypes.length);
  for (const c of catalog)
    assert(isType(c.type_key) && typeof c.display_name === "string" && typeof c.action_label === "string" && positive(c.growth_target));
  const spots = new Set<unknown>();
  const ids = new Set<unknown>();
  for (const item of array(state.plants)) {
    const p = object(item);
    clock(p);
    const f = parseFlower(p.flower, catalog, garden.spot_capacity as number);
    assert(!spots.has(f.spot) && !ids.has(f.id));
    spots.add(f.spot);
    ids.add(f.id);
    parseEntries(p.entries);
    const picks = array(p.hydrangea_picks);
    assert(picks.length === 2 && picks.every((pick) => pick === null || moodPick(object(pick)) !== null));
    assert(typeof p.member1_submitted === "boolean" && typeof p.member2_submitted === "boolean");
    parseCustomQuestions(p.daisy_custom_questions);
    if (p.daisy_question !== null) {
      const q = object(p.daisy_question);
      assert(typeof q.question_id === "string" && typeof q.prompt === "string" && ["light", "deeper"].includes(q.category as string));
    }
  }
  assert(!spots.has(garden.next_spot));
  return value as GardenState;
}

export type DaisyPrompt =
  | { kind: "daily"; key: string; prompt: string; category: "light" | "deeper" }
  | { kind: "custom"; key: string; prompt: string; askedBy: 1 | 2 };

/**
 * The question a member answers on a Daisy today: the partner's custom
 * question if one is live, otherwise the shared daily question. Its `key` is
 * the `question_id` an answer must carry; the server rejects a stale one.
 */
export function daisyQuestionFor(plant: Pick<Plant, "daisy_question" | "daisy_custom_questions">, member: 1 | 2): DaisyPrompt | null {
  const custom = plant.daisy_custom_questions.find((q) => q.addressee_id === member);
  if (custom) return { kind: "custom", key: custom.question_key, prompt: custom.prompt, askedBy: custom.asker_id };
  const daily = plant.daisy_question;
  return daily ? { kind: "daily", key: daily.question_id, prompt: daily.prompt, category: daily.category } : null;
}

/** The question a member has asked the other on a Daisy today, if any. */
export function daisyAskedBy(plant: Pick<Plant, "daisy_custom_questions">, member: 1 | 2): CustomQuestion | null {
  return plant.daisy_custom_questions.find((q) => q.asker_id === member) ?? null;
}

/** Client-side mirror of the server edit rule: author, same day, 30 minutes. */
export function canEditAt(
  entry: Entry,
  state: Pick<GardenState, "member_id" | "garden_day" | "next_rollover_at">,
  now: number,
) {
  const deadline = Date.parse(entry.edit_deadline ?? "");
  return (
    entry.can_edit === true &&
    entry.author_id === state.member_id &&
    entry.garden_day === state.garden_day &&
    now < Date.parse(state.next_rollover_at) &&
    (entry.edit_deadline_inclusive ? now <= deadline : now < deadline)
  );
}

/** Visible empty spots in the current beds (beds of 12 expand as they fill). */
export function emptySpots(state: Pick<GardenState, "garden" | "plants">) {
  const used = new Set(state.plants.map((p) => p.flower.spot));
  return Array.from({ length: state.garden.spot_capacity }, (_, i) => i + 1).filter((spot) => !used.has(spot));
}
