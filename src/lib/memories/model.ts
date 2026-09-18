import type { FlowerType } from "@/components/garden/flower-sprite";
import { moods } from "@/lib/garden/model";
import { compareTimestamps } from "@/lib/garden/timestamp";

export const MEMORY_PAGE_SIZE = 20;
export const memoryTypes = [
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
export type MemoryKind = "entry" | "wish" | "peony";
export type MemoryCursor = { at: string; kind: MemoryKind; id: string };
export type MemoryFilters = {
  type?: FlowerType;
  spot?: number;
  from?: string;
  to?: string;
};
export type MemoryQuery = { filters: MemoryFilters } & (
  | { kind: "latest" }
  | { kind: "older" | "newer"; cursor: MemoryCursor }
  | { kind: "updates"; keys: string[] }
);
export type MemoryFlower = {
  id: string;
  type_key: FlowerType;
  spot: number;
  planted_at: string;
  planted_day: string;
  planted_by: 1 | 2 | null;
  first_bloom_at: string | null;
  first_bloom_day: string | null;
  shared_wish: string | null;
  fulfilled_at: string | null;
  fulfilled_by: 1 | 2 | null;
};
export type MemoryContribution = {
  author_id: 1 | 2;
  original_posted_at: string;
  garden_day: string;
  milestone: 1 | 3 | 4;
  text: string | null;
};
export type MemoryPeony = {
  contributions: MemoryContribution[];
  plan: {
    version: string;
    activity: string;
    starts_at: string;
    updated_at: string;
    updated_by: 1 | 2;
    acceptances: {
      author_id: 1 | 2;
      original_posted_at: string;
      garden_day: string;
    }[];
  } | null;
  completed: {
    milestone: number;
    garden_day: string;
    completed_at: string;
    member1_posted_at: string;
    member2_posted_at: string;
  }[];
};
export type MemoryItem = {
  key: string;
  kind: MemoryKind;
  source_id: string;
  at: string;
  garden_day: string;
  read_at: string;
  flower: MemoryFlower;
  entry: {
    author_id: 1 | 2;
    updated_at: string;
    payload: Record<string, string>;
    question: string | null;
  } | null;
  peony: MemoryPeony | null;
};
export type MemoryPage = {
  items: MemoryItem[];
  more: boolean;
  error: string | null;
};
const iso =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const numeric = /^[1-9]\d{0,18}$/;
const kinds = ["entry", "wish", "peony"];
const validTime = (v: unknown): v is string =>
  typeof v === "string" && iso.test(v) && Number.isFinite(Date.parse(v));
function validDay(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
  );
}
const positive = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Invalid memories response");
  return v as Record<string, unknown>;
}
function assert(v: unknown): asserts v {
  if (!v) throw new Error("Invalid memories response");
}
function time(v: unknown) {
  assert(validTime(v));
  return v;
}
function day(v: unknown) {
  assert(validDay(v));
  return v;
}
function string(v: unknown) {
  assert(typeof v === "string");
  return v;
}
function author(v: unknown): 1 | 2 {
  assert(v === 1 || v === 2);
  return v;
}
function list(v: unknown, max: number): unknown[] {
  assert(Array.isArray(v) && v.length <= max);
  return v;
}
function source(kind: unknown, id: unknown) {
  return (
    typeof id === "string" &&
    (kind === "entry"
      ? numeric.test(id)
      : (kind === "wish" || kind === "peony") && uuid.test(id))
  );
}
function validKey(v: unknown) {
  if (typeof v !== "string") return false;
  const [kind, id, extra] = v.split(":");
  return extra === undefined && source(kind, id);
}
export function validMemoryQuery(value: unknown): value is MemoryQuery {
  try {
    const q = record(value),
      f = record(q.filters);
    if (
      (f.type !== undefined && !memoryTypes.includes(f.type as FlowerType)) ||
      (f.spot !== undefined && (!positive(f.spot) || f.spot > 2147483647)) ||
      (f.from !== undefined && !validDay(f.from)) ||
      (f.to !== undefined && !validDay(f.to)) ||
      (f.from && f.to && f.from > f.to)
    )
      return false;
    if (q.kind === "latest") return true;
    if (q.kind === "updates")
      return (
        Array.isArray(q.keys) &&
        q.keys.length > 0 &&
        q.keys.length <= MEMORY_PAGE_SIZE &&
        q.keys.every(validKey)
      );
    const c = record(q.cursor);
    return (
      (q.kind === "older" || q.kind === "newer") &&
      validTime(c.at) &&
      source(c.kind, c.id)
    );
  } catch {
    return false;
  }
}
function parseFlower(value: unknown): MemoryFlower {
  const f = record(value);
  assert(
    typeof f.id === "string" &&
      uuid.test(f.id) &&
      memoryTypes.includes(f.type_key as FlowerType) &&
      positive(f.spot),
  );
  return {
    id: f.id,
    type_key: f.type_key as FlowerType,
    spot: f.spot,
    planted_at: time(f.planted_at),
    planted_day: day(f.planted_day),
    planted_by: f.planted_by === null ? null : author(f.planted_by),
    first_bloom_at: f.first_bloom_at === null ? null : time(f.first_bloom_at),
    first_bloom_day: f.first_bloom_day === null ? null : day(f.first_bloom_day),
    shared_wish: f.shared_wish === null ? null : string(f.shared_wish),
    fulfilled_at: f.fulfilled_at === null ? null : time(f.fulfilled_at),
    fulfilled_by: f.fulfilled_by === null ? null : author(f.fulfilled_by),
  };
}
function parsePeony(value: unknown): MemoryPeony {
  const p = record(value);
  const contributions = list(p.contributions, 6).map<MemoryContribution>(
    (v) => {
      const c = record(v);
      assert(c.milestone === 1 || c.milestone === 3 || c.milestone === 4);
      return {
        milestone: c.milestone,
        author_id: author(c.author_id),
        original_posted_at: time(c.original_posted_at),
        garden_day: day(c.garden_day),
        text: c.milestone === 3 ? null : string(c.text),
      };
    },
  );
  const completed = list(p.completed, 4).map((v) => {
    const c = record(v);
    assert(
      typeof c.milestone === "number" && [1, 2, 3, 4].includes(c.milestone),
    );
    return {
      milestone: c.milestone,
      garden_day: day(c.garden_day),
      completed_at: time(c.completed_at),
      member1_posted_at: time(c.member1_posted_at),
      member2_posted_at: time(c.member2_posted_at),
    };
  });
  let plan: MemoryPeony["plan"] = null;
  if (p.plan !== null) {
    const v = record(p.plan);
    assert(typeof v.version === "string" && numeric.test(v.version));
    plan = {
      version: v.version,
      activity: string(v.activity),
      starts_at: time(v.starts_at),
      updated_at: time(v.updated_at),
      updated_by: author(v.updated_by),
      acceptances: list(v.acceptances, 2).map((a) => {
        const r = record(a);
        return {
          author_id: author(r.author_id),
          original_posted_at: time(r.original_posted_at),
          garden_day: day(r.garden_day),
        };
      }),
    };
  }
  return { contributions, plan, completed };
}
export function parseMemoryPage(value: unknown): MemoryPage {
  const page = record(value);
  assert(typeof page.more === "boolean");
  const items = list(page.items, MEMORY_PAGE_SIZE).map((value) => {
    const i = record(value);
    assert(
      kinds.includes(i.kind as string) &&
        source(i.kind, i.source_id) &&
        i.key === `${i.kind}:${i.source_id}`,
    );
    const flower = parseFlower(i.flower);
    let entry: MemoryItem["entry"] = null;
    let peony: MemoryPeony | null = null;
    if (i.kind === "entry") {
      assert(flower.type_key !== "peony");
      const e = record(i.entry),
        raw = record(e.payload);
      const payload: Record<string, string> = {};
      const fields =
        flower.type_key === "cactus"
          ? []
          : flower.type_key === "tulip"
            ? ["title", "artist", "url"]
            : flower.type_key === "hydrangea"
              ? ["mood"]
              : ["sunflower", "bluebell"].includes(flower.type_key)
                ? ["media_id"]
                : ["text"];
      for (const key of fields) payload[key] = string(raw[key]);
      if (payload.media_id) assert(uuid.test(payload.media_id));
      if (flower.type_key === "hydrangea")
        assert(moods.some((m) => m.key === payload.mood));
      entry = {
        author_id: author(e.author_id),
        updated_at: time(e.updated_at),
        payload,
        question: flower.type_key === "daisy" ? string(e.question) : null,
      };
    } else if (i.kind === "peony") {
      assert(flower.type_key === "peony" && i.source_id === flower.id);
      peony = parsePeony(i.peony);
    } else
      assert(
        flower.type_key === "dandelion" &&
          i.source_id === flower.id &&
          flower.shared_wish !== null,
      );
    return {
      key: string(i.key),
      kind: i.kind as MemoryKind,
      source_id: string(i.source_id),
      at: time(i.at),
      garden_day: day(i.garden_day),
      read_at: time(i.read_at),
      flower,
      entry,
      peony,
    };
  });
  assert(new Set(items.map((i) => i.key)).size === items.length);
  return { items, more: page.more, error: null };
}
export function cursorFor(item: MemoryItem): MemoryCursor {
  return { at: item.at, kind: item.kind, id: item.source_id };
}
const cmp = (a: string, b: string) => (a === b ? 0 : a > b ? 1 : -1);
export function compareMemories(a: MemoryItem, b: MemoryItem) {
  return (
    compareTimestamps(a.at, b.at) ||
    cmp(a.kind, b.kind) ||
    cmp(a.source_id, b.source_id)
  );
}
/** Full snapshots replace a bundle, including removed current-plan acceptances. */
export function mergeMemories(existing: MemoryItem[], incoming: MemoryItem[]) {
  const items = new Map(existing.map((i) => [i.key, i]));
  for (const next of incoming) {
    const old = items.get(next.key);
    if (!old || compareTimestamps(next.read_at, old.read_at) >= 0)
      items.set(next.key, next);
  }
  return [...items.values()].sort((a, b) => compareMemories(b, a));
}
