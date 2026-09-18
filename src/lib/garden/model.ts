import type {
  FlowerType,
  HydrangeaMood,
} from "@/components/garden/flower-sprite";

export type ClockState = {
  server_now: string;
  garden_day: string;
  day_starts_at: string;
  next_rollover_at: string;
  moonflower_open: boolean;
};
export type CatalogItem = {
  type_key: FlowerType;
  display_name: string;
  action_label: string;
  growth_target: number;
  unfinished_limit: number;
  unlock_after_blooms: number;
};
export type Entry = {
  id: number;
  flower_id: string;
  author_id: 1 | 2;
  garden_day: string;
  original_posted_at: string;
  updated_at: string;
  payload: Record<string, string>;
  daisy_assignment_day: string | null;
  edit_deadline?: string;
  edit_deadline_inclusive?: boolean;
  can_edit?: boolean;
};
export type Plant = ClockState & {
  flower: {
    id: string;
    garden_id: number;
    type_key: FlowerType;
    spot: number;
    planted_at: string;
    planted_day: string;
    planted_by: 1 | 2 | null;
    is_initial: boolean;
    shared_wish: string | null;
    growth_units: number;
    first_bloom_at: string | null;
    first_bloom_day: string | null;
  };
  entries: Entry[];
  daisy_question: {
    garden_day: string;
    ordinal: number;
    question_id: string;
    category: "light" | "deeper";
    prompt: string;
    assigned_at: string;
  } | null;
  member1_submitted: boolean;
  member2_submitted: boolean;
};
export type GardenState = ClockState & {
  member_id: 1 | 2;
  garden: {
    id: number;
    initialized_at: string;
    next_spot: number;
    spot_capacity: number;
    last_settled_day: string | null;
    current_streak: number;
    longest_streak: number;
    qualifying_days: number;
  };
  catalog: CatalogItem[];
  unlocks: { type_key: string; unlocked_at: string }[];
  plants: Plant[];
};
export type GardenResult = {
  state: GardenState | null;
  error: string | null;
  saved?: boolean;
};
export type GardenCommand =
  | { kind: "plant"; type: FlowerType; spot: number; wish?: string }
  | { kind: "submit"; flowerId: string; payload: Record<string, string> }
  | { kind: "edit"; entryId: number; payload: Record<string, string> };

const types = [
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
];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid garden response");
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Invalid garden response");
  return value;
}
function positive(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
function timestamp(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Invalid garden response");
}
function clock(value: Record<string, unknown>) {
  assert(
    timestamp(value.server_now) &&
      timestamp(value.day_starts_at) &&
      timestamp(value.next_rollover_at) &&
      typeof value.garden_day === "string" &&
      typeof value.moonflower_open === "boolean",
  );
}
export function parseEntries(value: unknown): Entry[] {
  for (const item of array(value)) {
    const e = object(item);
    assert(
      positive(e.id) &&
        typeof e.flower_id === "string" &&
        [1, 2].includes(e.author_id as number) &&
        typeof e.garden_day === "string" &&
        timestamp(e.original_posted_at) &&
        timestamp(e.updated_at),
    );
    const payload = object(e.payload);
    assert(Object.values(payload).every((v) => typeof v === "string"));
    if (e.edit_deadline !== undefined)
      assert(
        timestamp(e.edit_deadline) &&
          typeof e.can_edit === "boolean" &&
          typeof e.edit_deadline_inclusive === "boolean",
      );
  }
  return value as Entry[];
}
/** Validate consumed values before rendering artwork or allocating visible spots. */
export function parseGardenState(value: unknown): GardenState {
  const state = object(value);
  clock(state);
  assert(state.member_id === 1 || state.member_id === 2);
  const garden = object(state.garden);
  assert(
    garden.id === 1 &&
      positive(garden.spot_capacity) &&
      (garden.spot_capacity as number) % 12 === 0 &&
      positive(garden.next_spot),
  );
  const catalog = array(state.catalog).map(object);
  assert(
    catalog.length === 13 &&
      new Set(catalog.map((c) => c.type_key)).size === 13,
  );
  for (const c of catalog)
    assert(
      types.includes(c.type_key as string) &&
        typeof c.display_name === "string" &&
        typeof c.action_label === "string" &&
        positive(c.growth_target) &&
        positive(c.unfinished_limit) &&
        Number.isSafeInteger(c.unlock_after_blooms) &&
        (c.unlock_after_blooms as number) >= 0,
    );
  for (const item of array(state.unlocks)) {
    const u = object(item);
    assert(types.includes(u.type_key as string) && timestamp(u.unlocked_at));
  }
  const spots = new Set();
  const ids = new Set();
  for (const item of array(state.plants)) {
    const p = object(item);
    clock(p);
    const f = object(p.flower);
    const c = catalog.find((c) => c.type_key === f.type_key);
    assert(
      c &&
        typeof f.id === "string" &&
        !ids.has(f.id) &&
        positive(f.spot) &&
        (f.spot as number) <= (garden.spot_capacity as number) &&
        !spots.has(f.spot) &&
        Number.isSafeInteger(f.growth_units) &&
        (f.growth_units as number) >= 0 &&
        (f.growth_units as number) <= (c.growth_target as number) &&
        (f.first_bloom_at === null || timestamp(f.first_bloom_at)) &&
        (f.shared_wish === null || typeof f.shared_wish === "string"),
    );
    spots.add(f.spot);
    ids.add(f.id);
    parseEntries(p.entries);
    assert(
      typeof p.member1_submitted === "boolean" &&
        typeof p.member2_submitted === "boolean",
    );
    if (p.daisy_question !== null) {
      const q = object(p.daisy_question);
      assert(
        typeof q.question_id === "string" &&
          typeof q.prompt === "string" &&
          ["light", "deeper"].includes(q.category as string),
      );
    }
  }
  return value as GardenState;
}
export function seedAvailability(item: CatalogItem, state: GardenState) {
  const count = state.plants.filter(
    (p) =>
      p.flower.type_key === item.type_key && p.flower.first_bloom_at === null,
  ).length;
  const remaining = Math.max(0, item.unfinished_limit - count);
  if (item.type_key === "cactus")
    return {
      available: false,
      remaining: 0,
      reason: "Your one permanent Cactus is already here.",
    };
  if (!state.unlocks.some((u) => u.type_key === item.type_key))
    return {
      available: false,
      remaining: 0,
      reason: `Unlocks after ${item.unlock_after_blooms} total bloom${item.unlock_after_blooms === 1 ? "" : "s"}.`,
    };
  if (!remaining)
    return {
      available: false,
      remaining,
      reason: `All ${item.unfinished_limit} growing spot${item.unfinished_limit === 1 ? "" : "s"} for this type are in use. Bloom one to plant another.`,
    };
  return {
    available: true,
    remaining,
    reason: `${remaining} of ${item.unfinished_limit} available to grow.`,
  };
}
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
export const moods: { key: HydrangeaMood; label: string; color: string }[] = [
  { key: "calm", label: "Calm · Blue", color: "#6f9eab" },
  { key: "joyful", label: "Joyful · Yellow", color: "#e2b84f" },
  { key: "tender", label: "Tender · Pink", color: "#d88798" },
  { key: "energized", label: "Energized · Orange", color: "#d9854f" },
  { key: "low", label: "Low · Lavender", color: "#8b87ab" },
  { key: "tense", label: "Tense · Red", color: "#b86b61" },
];
export const pacificTime = (date: string | number) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(date));
