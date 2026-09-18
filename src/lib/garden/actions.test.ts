// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture, entryFixture } from "@/test/garden-fixture";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { mutateGarden, refreshGarden, loadFlowerHistory } from "./actions";
beforeEach(() => {
  rpc.mockReset();
  guard.mockReset().mockResolvedValue({
    client: { rpc },
    member: { member_id: 1, member_role: "owner" },
  });
});
it("rechecks membership before any action, including direct calls", async () => {
  guard.mockRejectedValue(new Error("denied"));
  await expect(
    mutateGarden({ kind: "submit", flowerId: "x", payload: {} }),
  ).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("plants only the selected spot and refreshes authoritative state after success", async () => {
  rpc
    .mockResolvedValueOnce({ data: {}, error: null })
    .mockResolvedValueOnce({ data: gardenFixture(), error: null });
  const result = await mutateGarden({
    kind: "plant",
    type: "dandelion",
    spot: 9,
    wish: "A shared trip",
  });
  expect(rpc.mock.calls).toEqual([
    [
      "plant_flower_at",
      { p_type_key: "dandelion", p_spot: 9, p_shared_wish: "A shared trip" },
    ],
    ["current_garden_state"],
  ]);
  expect(result.saved).toBe(true);
  expect(result.state?.member_id).toBe(1);
});
it("refreshes after rejected/ambiguous writes and never reports saved", async () => {
  rpc
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ data: gardenFixture(), error: null });
  const result = await mutateGarden({
    kind: "submit",
    flowerId: "flower",
    payload: { text: "Draft" },
  });
  expect(result.saved).toBe(false);
  expect(result.state).not.toBeNull();
  expect(result.error).toMatch(/could not confirm/i);
  expect(rpc).toHaveBeenLastCalledWith("current_garden_state");
});
it("explains an expired edit without leaking unknown backend messages", async () => {
  rpc
    .mockResolvedValueOnce({
      error: { code: "22023", message: "The edit window has ended" },
    })
    .mockResolvedValueOnce({ data: gardenFixture(), error: null });
  expect(
    (await mutateGarden({ kind: "edit", entryId: 2, payload: { text: "new" } }))
      .error,
  ).toMatch(/edit window/);
  rpc.mockResolvedValue({ error: { message: "PRIVATE_DETAIL" } });
  expect(JSON.stringify(await refreshGarden())).not.toContain("PRIVATE_DETAIL");
});
it("requests bounded readonly history with the exact exclusive cursor", async () => {
  rpc.mockResolvedValue({ data: [entryFixture()], error: null });
  const result = await loadFlowerHistory("flower", 51);
  expect(rpc).toHaveBeenCalledWith("entry_history", {
    p_flower_id: "flower",
    p_limit: 20,
    p_before_id: 51,
  });
  expect(result.entries[0].payload.text).toBe("A quiet walk together.");
});
it("preserves the action response on an unavailable membership service without allowing a write", async () => {
  const { MemberAccessUnavailableError } =
    await import("@/lib/auth/access-error");
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  const result = await mutateGarden({
    kind: "submit",
    flowerId: "flower",
    payload: { text: "keep" },
  });
  expect(result).toMatchObject({
    saved: false,
    state: null,
    error: expect.stringMatching(/connection/i),
  });
  expect(rpc).not.toHaveBeenCalled();
});
it("fulfills using only the instance identity and rereads both accepted and rejected results", async () => {
  for (const error of [null, { code: "22023", message: "PRIVATE_DETAIL" }]) {
    rpc.mockReset()
      .mockResolvedValueOnce({ data: {}, error })
      .mockResolvedValueOnce({ data: gardenFixture(), error: null });
    const result = await mutateGarden({ kind: "fulfillDandelion", flowerId: "wish" });
    expect(rpc.mock.calls).toEqual([
      ["fulfill_dandelion", { p_flower_id: "wish" }],
      ["current_garden_state"],
    ]);
    expect(result.saved).toBe(error === null);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_DETAIL");
  }
});
