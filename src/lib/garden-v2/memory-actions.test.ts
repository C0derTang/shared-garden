// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
const { guard, rpc } = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { loadMemoriesV2 } from "./memory-actions";

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ client: { rpc } });
  rpc.mockResolvedValue({ data: { items: [], more: false }, error: null });
});
it("authorizes every page", async () => {
  guard.mockRejectedValue(new Error("denied"));
  await expect(loadMemoriesV2()).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("reads only the v2 memories RPC with the legacy page contract", async () => {
  const cursor = {
    at: "2026-11-02T17:00:00.000001Z",
    kind: "entry" as const,
    id: "9007199254740993",
  };
  expect(
    await loadMemoriesV2({
      kind: "older",
      cursor,
      filters: { type: "peony", author: 1 },
    }),
  ).toEqual({
    items: [],
    more: false,
    error: null,
  });
  expect(rpc).toHaveBeenCalledWith("v2_memories_page", {
    p_mode: "older",
    p_cursor: cursor,
    p_keys: null,
    p_type: "peony",
    p_spot: null,
    p_from: null,
    p_to: null,
    p_author: 1,
  });
  expect(rpc).not.toHaveBeenCalledWith("memories_page", expect.anything());
});
it("rejects invalid queries before the database and hides backend detail", async () => {
  await loadMemoriesV2({
    kind: "updates",
    filters: {},
    keys: Array(21).fill("entry:1"),
  });
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAIL"));
  expect((await loadMemoriesV2()).error).not.toContain("PRIVATE_BACKEND_DETAIL");
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  expect((await loadMemoriesV2()).error).toContain("could not load");
});
