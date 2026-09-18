import type { MemoryItem } from "@/lib/memories/model";
export const memoryFlowerFixture = {
  id: "00000000-0000-4000-8000-000000000001",
  type_key: "rose",
  spot: 2,
  planted_at: "2026-08-01T17:00:00Z",
  planted_day: "2026-08-01",
  planted_by: 1,
  first_bloom_at: null,
  first_bloom_day: null,
  shared_wish: null,
  fulfilled_at: null,
  fulfilled_by: null,
};
export const memoryFixture = (id = "1"): MemoryItem =>
  ({
    key: `entry:${id}`,
    kind: "entry",
    source_id: id,
    at: "2026-09-18T17:00:00.000001Z",
    garden_day: "2026-09-18",
    flower: memoryFlowerFixture,
    entry: {
      author_id: 1,
      updated_at: "2026-09-18T17:00:00.000001Z",
      payload: { text: "A quiet walk." },
      question: null,
    },
    peony: null,
    read_at: "2026-09-18T18:00:00.000001Z",
  }) as MemoryItem;
