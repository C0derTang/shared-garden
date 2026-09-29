// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { readReplies, saveReply } from "./actions";
const reply = { id: 1, entry_id: 9, author_id: 2, body: "Thanks", created_at: "2026-09-29T18:00:00Z" };
beforeEach(() => { vi.clearAllMocks(); guard.mockResolvedValue({ client: { rpc } }); });
it("rechecks membership for direct read and write calls", async () => {
  guard.mockRejectedValue(Error("denied"));
  await expect(readReplies(9)).rejects.toThrow("denied");
  await expect(saveReply(9, "Thanks", "token")).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("sends only parent, text and retry ID without any care or settlement action", async () => {
  rpc.mockResolvedValue({ data: reply, error: null });
  expect(await saveReply(9, "Thanks", "token")).toEqual({ reply, error: null });
  expect(rpc.mock.calls).toEqual([["reply_to_entry", { p_entry_id: 9, p_body: "Thanks", p_request_id: "token" }]]);
});
it("uses bounded cursor reads and rejects malformed replies", async () => {
  rpc.mockResolvedValueOnce({ data: [reply], error: null });
  expect((await readReplies(9, 20)).replies).toEqual([reply]);
  expect(rpc).toHaveBeenLastCalledWith("entry_reply_history", { p_entry_id: 9, p_limit: 50, p_before_id: 20 });
  rpc.mockResolvedValueOnce({ data: [{ ...reply, author_id: 3 }], error: null });
  expect((await readReplies(9)).error).toMatch(/could not load/);
});
it("distinguishes definite rejection from ambiguous response without leaking backend details", async () => {
  rpc.mockResolvedValueOnce({ error: { code: "22023", message: "PRIVATE_DETAIL" } });
  const rejected = await saveReply(9, "", "token");
  expect(rejected.rejected).toBe(true);
  expect(JSON.stringify(rejected)).not.toContain("PRIVATE_DETAIL");
  rpc.mockRejectedValueOnce(Error("PRIVATE_DETAIL"));
  const ambiguous = await saveReply(9, "Thanks", "token");
  expect(ambiguous.rejected).toBeUndefined();
  expect(ambiguous.error).toMatch(/Retry/);
});
