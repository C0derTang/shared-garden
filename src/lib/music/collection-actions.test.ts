// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { entryFixture } from "@/test/garden-fixture";
const { guard, from, query } = vi.hoisted(() => ({
  guard: vi.fn(),
  from: vi.fn(),
  query: {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    lt: vi.fn(),
    gt: vi.fn(),
    in: vi.fn(),
  },
}));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { loadSongs } from "./collection-actions";
beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ client: { from } });
  from.mockReturnValue(query);
  for (const key of ["select", "eq", "order", "lt", "gt", "in"] as const)
    query[key].mockReturnValue(query);
  query.limit.mockResolvedValue({ data: [], error: null });
});
it("authorizes every read before querying and propagates denied membership", async () => {
  guard.mockRejectedValue(new Error("denied"));
  await expect(loadSongs({ kind: "latest" })).rejects.toThrow("denied");
  expect(from).not.toHaveBeenCalled();
});
it("uses a bounded Tulip-only query including all instances without a bloom or author exclusion", async () => {
  const song = {
    ...entryFixture(),
    payload: { title: "Song", artist: "Artist", url: "https://example.com" },
  };
  query.limit.mockResolvedValue({
    data: Array.from({ length: 21 }, (_, i) => ({ ...song, id: 50 - i })),
    error: null,
  });
  const page = await loadSongs({ kind: "older", id: 51 });
  expect(from).toHaveBeenCalledWith("flower_entries");
  expect(query.select).toHaveBeenCalledWith(
    expect.stringContaining("flowers!inner(type_key)"),
  );
  expect(query.eq.mock.calls).toEqual([["flowers.type_key", "tulip"]]);
  expect(query.lt).toHaveBeenCalledWith("id", 51);
  expect(query.limit).toHaveBeenCalledWith(21);
  expect(page.entries).toHaveLength(20);
  expect(page.more).toBe(true);
});
it("loads newly arrived IDs ascending so more than a page cannot create gaps", async () => {
  await loadSongs({ kind: "newer", id: 30 });
  expect(query.gt).toHaveBeenCalledWith("id", 30);
  expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
});
it("bounds refreshing existing IDs and conceals query failures", async () => {
  await loadSongs({ kind: "updates", ids: [1, 5] });
  expect(query.in).toHaveBeenCalledWith("id", [1, 5]);
  query.limit.mockRejectedValue(new Error("PRIVATE_DETAIL"));
  expect((await loadSongs({ kind: "latest" })).error).not.toContain(
    "PRIVATE_DETAIL",
  );
  from.mockClear();
  await loadSongs({ kind: "updates", ids: Array(21).fill(1) });
  expect(from).not.toHaveBeenCalled();
});
