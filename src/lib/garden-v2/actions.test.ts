// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { loadFlowerHistoryV2, mutateGardenV2, readRepliesV2, refreshGardenV2, saveReplyV2 } from "./actions";

beforeEach(() => {
  rpc.mockReset();
  guard.mockReset().mockResolvedValue({ client: { rpc }, member: { member_id: 1, member_role: "owner" } });
});
it("rechecks membership before any action, including direct calls", async () => {
  guard.mockRejectedValue(new Error("denied"));
  await expect(mutateGardenV2({ kind: "submit", flowerId: "x", payload: {} })).rejects.toThrow("denied");
  await expect(saveReplyV2(1, "Hi", "token")).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("calls only v2 RPCs and rereads the authoritative v2 state", async () => {
  const commands = [
    [{ kind: "plant", type: "dandelion", spot: 9, wish: "A shared trip" }, "v2_plant_flower_at", { p_type_key: "dandelion", p_spot: 9, p_shared_wish: "A shared trip" }],
    [{ kind: "plant", type: "cactus", spot: 3 }, "v2_plant_flower_at", { p_type_key: "cactus", p_spot: 3, p_shared_wish: null }],
    [{ kind: "submit", flowerId: "f", payload: { text: "Hi" } }, "v2_submit_flower_entry", { p_flower_id: "f", p_payload: { text: "Hi" } }],
    [{ kind: "edit", entryId: 2, payload: { text: "New" } }, "v2_edit_flower_entry", { p_entry_id: 2, p_payload: { text: "New" } }],
    [{ kind: "fulfillDandelion", flowerId: "w" }, "v2_fulfill_dandelion", { p_flower_id: "w" }],
  ] as const;
  for (const [command, name, args] of commands) {
    rpc.mockReset().mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: v2GardenFixture(), error: null });
    const result = await mutateGardenV2(command);
    expect(rpc.mock.calls).toEqual([[name, args], ["v2_current_garden_state"]]);
    expect(result).toMatchObject({ saved: true, error: null });
    expect(result.state?.member_id).toBe(1);
  }
});
it("refreshes after rejected or ambiguous writes without leaking backend details", async () => {
  rpc.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: v2GardenFixture(), error: null });
  const ambiguous = await mutateGardenV2({ kind: "submit", flowerId: "f", payload: { text: "Draft" } });
  expect(ambiguous.saved).toBe(false);
  expect(ambiguous.error).toMatch(/could not confirm/i);
  rpc.mockReset()
    .mockResolvedValueOnce({ error: { code: "22023", message: "The edit window has ended" } })
    .mockResolvedValueOnce({ data: v2GardenFixture(), error: null });
  expect((await mutateGardenV2({ kind: "edit", entryId: 2, payload: { text: "x" } })).error).toMatch(/edit window/);
  rpc.mockReset()
    .mockResolvedValueOnce({ error: { code: "22023", message: "Planting spot is occupied" } })
    .mockResolvedValueOnce({ data: v2GardenFixture(), error: null });
  expect((await mutateGardenV2({ kind: "plant", type: "rose", spot: 1 })).error).toMatch(/spot is no longer available/);
  rpc.mockReset().mockResolvedValue({ error: { message: "PRIVATE_DETAIL" } });
  expect(JSON.stringify(await refreshGardenV2())).not.toContain("PRIVATE_DETAIL");
  expect(JSON.stringify(await mutateGardenV2({ kind: "submit", flowerId: "f", payload: {} }))).not.toContain("PRIVATE_DETAIL");
});
it("keeps the draft when membership service is unavailable", async () => {
  const { MemberAccessUnavailableError } = await import("@/lib/auth/access-error");
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  expect(await mutateGardenV2({ kind: "submit", flowerId: "f", payload: { text: "keep" } })).toMatchObject({
    saved: false,
    state: null,
    error: expect.stringMatching(/connection/i),
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("reads bounded history and replies from v2 RPCs", async () => {
  rpc.mockResolvedValueOnce({ data: [v2EntryFixture()], error: null });
  expect((await loadFlowerHistoryV2("f", 51)).entries).toHaveLength(1);
  expect(rpc).toHaveBeenLastCalledWith("v2_entry_history", { p_flower_id: "f", p_limit: 20, p_before_id: 51 });
  const reply = { id: 1, entry_id: 9, author_id: 2, body: "Thanks", created_at: "2026-11-02T18:00:00Z" };
  rpc.mockResolvedValueOnce({ data: [reply], error: null });
  expect((await readRepliesV2(9, 20)).replies).toEqual([reply]);
  expect(rpc).toHaveBeenLastCalledWith("v2_entry_reply_history", { p_entry_id: 9, p_limit: 50, p_before_id: 20 });
  rpc.mockResolvedValueOnce({ data: reply, error: null });
  expect(await saveReplyV2(9, "Thanks", "token")).toEqual({ reply, error: null });
  expect(rpc).toHaveBeenLastCalledWith("v2_reply_to_entry", { p_entry_id: 9, p_body: "Thanks", p_request_id: "token" });
  rpc.mockResolvedValueOnce({ error: { code: "22023", message: "PRIVATE_DETAIL" } });
  const rejected = await saveReplyV2(9, "", "token");
  expect(rejected.rejected).toBe(true);
  expect(JSON.stringify(rejected)).not.toContain("PRIVATE_DETAIL");
});
