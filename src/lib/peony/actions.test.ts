// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { readPeony, mutatePeony } from "./actions";
const state = {
  server_now: "2030-01-01T12:00:00Z",
  next_rollover_at: "2030-01-02T12:00:00Z",
  garden_day: "2030-01-01",
  member_id: 1,
  stage: 0,
  next_milestone: 1,
  contributions: [],
  completed_milestones: [],
  plan: null,
};
beforeEach(() => {
  rpc.mockReset();
  guard.mockReset().mockResolvedValue({ client: { rpc } });
});
it("requires live membership on reads and writes", async () => {
  guard.mockRejectedValue(Error("denied"));
  await expect(readPeony("x")).rejects.toThrow("denied");
  await expect(
    mutatePeony("x", { kind: "accept", version: 2 }),
  ).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("sends only the exact observed version, activity and scheduled instant, then rereads", async () => {
  rpc.mockResolvedValue({ data: state, error: null });
  expect(
    (
      await mutatePeony("x", {
        kind: "plan",
        version: 4,
        activity: "Remote game",
        startsAt: "2030-11-03T01:30:00-08:00",
      })
    ).saved,
  ).toBe(true);
  expect(rpc.mock.calls).toEqual([
    [
      "set_peony_plan",
      {
        p_flower_id: "x",
        p_expected_version: 4,
        p_activity: "Remote game",
        p_starts_at: "2030-11-03T01:30:00-08:00",
      },
    ],
    ["current_peony_state", { p_flower_id: "x" }],
  ]);
});
it("rereads after stale rejection and ambiguous transport without claiming a save", async () => {
  for (const failure of [
    { error: { code: "22023", message: "PRIVATE" } },
    Error("network"),
  ]) {
    rpc.mockReset();
    if (failure instanceof Error) rpc.mockRejectedValueOnce(failure);
    else rpc.mockResolvedValueOnce(failure);
    rpc.mockResolvedValueOnce({ data: state, error: null });
    const r = await mutatePeony("x", { kind: "accept", version: 2 });
    expect(r.saved).toBe(false);
    expect(r.state).toEqual(state);
    expect(r.error).not.toContain("PRIVATE");
    expect(rpc).toHaveBeenLastCalledWith("current_peony_state", {
      p_flower_id: "x",
    });
  }
});
