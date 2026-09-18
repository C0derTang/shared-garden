import { expect, it } from "vitest";
import {
  parseMemoryPage,
  validMemoryQuery,
  mergeMemories,
  cursorFor,
  type MemoryItem,
} from "./model";
import {
  memoryFixture,
  memoryFlowerFixture as flower,
} from "@/test/memory-fixture";
it("retains timestamp precision and allowlists fields at every shared boundary", () => {
  const raw = memoryFixture();
  const page = parseMemoryPage({
    items: [
      {
        ...raw,
        private_config: "secret",
        flower: { ...flower, token: "secret" },
        entry: {
          ...raw.entry,
          private_note: "secret",
          payload: { text: "A quiet walk.", hidden: "secret" },
        },
      },
    ],
    more: false,
  });
  expect(JSON.stringify(page)).not.toContain("secret");
  expect(page.items[0].at).toBe(raw.at);
  expect(cursorFor(page.items[0])).toEqual({
    at: raw.at,
    kind: "entry",
    id: "1",
  });
});
it("bounds queries and validates dates, filter types and composite cursors", () => {
  expect(validMemoryQuery({ kind: "latest", filters: {} })).toBe(true);
  expect(
    validMemoryQuery({
      kind: "older",
      filters: {},
      cursor: cursorFor(memoryFixture()),
    }),
  ).toBe(true);
  for (const query of [
    { kind: "latest", filters: { type: "secret" } },
    { kind: "latest", filters: { from: "2026-02-30" } },
    { kind: "latest", filters: { from: "2026-09-19", to: "2026-09-18" } },
    {
      kind: "older",
      filters: {},
      cursor: { at: "2026-09-18", kind: "entry", id: "1" },
    },
    { kind: "updates", filters: {}, keys: Array(21).fill("entry:1") },
  ])
    expect(validMemoryQuery(query)).toBe(false);
});
it("reconciles complete snapshots by microseconds, preserving independent source identities", () => {
  const old = memoryFixture();
  const newer = {
    ...old,
    read_at: "2026-09-18T18:00:00.000002Z",
    entry: { ...old.entry!, payload: { text: "Replacement" } },
  };
  const wish = {
    ...old,
    key: `wish:${flower.id}`,
    kind: "wish",
    source_id: flower.id,
  } as MemoryItem;
  expect(mergeMemories([newer, wish], [old])).toHaveLength(2);
  expect(mergeMemories([newer], [old])[0].entry?.payload.text).toBe(
    "Replacement",
  );
});
it("rejects malformed typed content and oversized pages", () => {
  expect(() =>
    parseMemoryPage({ items: Array(21).fill(memoryFixture()), more: false }),
  ).toThrow();
  expect(() =>
    parseMemoryPage({
      items: [
        { ...memoryFixture(), flower: { ...flower, type_key: "sunflower" } },
      ],
      more: false,
    }),
  ).toThrow();
});
