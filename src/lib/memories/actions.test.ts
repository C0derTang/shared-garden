// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
const { guard, rpc } = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { loadMemories } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ client: { rpc } });
  rpc.mockResolvedValue({ data: { items: [], more: false }, error: null });
});
it("authorizes every page and propagates denied membership", async () => {
  guard.mockRejectedValue(new Error("denied"));
  await expect(loadMemories({ kind: "latest", filters: {} })).rejects.toThrow(
    "denied",
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("uses only the bounded read-only RPC with opaque cursor precision and sanitized filters", async () => {
  const cursor = {
    at: "2026-08-01T17:00:00.000001Z",
    kind: "entry" as const,
    id: "9007199254740993",
  };
  await loadMemories({
    kind: "newer",
    cursor,
    filters: { type: "rose", spot: 2, from: "2026-08-01" },
  });
  expect(rpc).toHaveBeenCalledWith("memories_page", {
    p_mode: "newer",
    p_cursor: cursor,
    p_keys: null,
    p_type: "rose",
    p_spot: 2,
    p_from: "2026-08-01",
    p_to: null,
  });
});
it("rejects invalid requests before database and hides backend failure detail", async () => {
  await loadMemories({
    kind: "updates",
    filters: {},
    keys: Array(21).fill("entry:1"),
  });
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAIL"));
  expect(
    (await loadMemories({ kind: "latest", filters: {} })).error,
  ).not.toContain("PRIVATE_BACKEND_DETAIL");
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  expect((await loadMemories({ kind: "latest", filters: {} })).error).toContain(
    "could not load",
  );
});
