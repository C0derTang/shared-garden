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
    [{ kind: "askDaisy", flowerId: "d", prompt: "A synthetic question?" }, "v2_ask_daisy_question", { p_flower_id: "d", p_question: { prompt: "A synthetic question?" } }],
    [{ kind: "removeDaisyQuestion", flowerId: "d" }, "v2_remove_daisy_question", { p_flower_id: "d" }],
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
it("maps Daisy question rejections to fixed wording", async () => {
  const cases = [
    ["Your question changed; refresh and answer again", /question just changed/],
    ["Answer the question asked of you", /question just changed/],
    ["The question is locked", /already answered/],
    ["An edit keeps its original question", /same question/],
    ["Ask a question of 1 to 300 characters", /1 to 300 characters/],
    ["Invalid question fields", /1 to 300 characters/],
  ] as const;
  for (const [message, wording] of cases) {
    rpc.mockReset().mockResolvedValueOnce({ error: { code: "22023", message } }).mockResolvedValueOnce({ data: v2GardenFixture(), error: null });
    const result = await mutateGardenV2({ kind: "askDaisy", flowerId: "d", prompt: "x" });
    expect(result.saved).toBe(false);
    expect(result.error).toMatch(wording);
    expect(result.error).not.toContain(message);
  }
});
it("labels earlier Daisy answers with the question each one answered", async () => {
  const daisy = { ...v2EntryFixture(), id: 4, daisy_assignment_day: "2026-11-01", daisy_custom_question_id: 9 };
  const rose = { ...v2EntryFixture(), id: 3 };
  rpc
    .mockResolvedValueOnce({ data: [daisy, rose], error: null })
    .mockResolvedValueOnce({ data: [{ entry_id: 4, question: { kind: "custom", prompt: "A synthetic question?", asked_by: 2 } }], error: null });
  const { entries } = await loadFlowerHistoryV2("f");
  expect(rpc).toHaveBeenLastCalledWith("v2_daisy_entry_questions", { p_entry_ids: [4] });
  expect(entries[0].question).toEqual({ kind: "custom", prompt: "A synthetic question?", asked_by: 2 });
  expect(entries[1].question).toBeUndefined();
  // A failed lookup keeps the history readable.
  rpc.mockReset().mockResolvedValueOnce({ data: [daisy], error: null }).mockResolvedValueOnce({ data: null, error: { message: "x" } });
  expect((await loadFlowerHistoryV2("f")).entries).toEqual([daisy]);
});
