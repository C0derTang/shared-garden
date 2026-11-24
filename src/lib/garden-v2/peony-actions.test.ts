// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { mutatePeonyV2, readPeonyV2 } from "./peony-actions";

const state = {
  server_now: "2026-11-02T18:00:00Z",
  next_rollover_at: "2026-11-03T12:00:00Z",
  garden_day: "2026-11-02",
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
  await expect(readPeonyV2("x")).rejects.toThrow("denied");
  await expect(mutatePeonyV2("x", { kind: "accept", version: 2 })).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("calls only v2 Peony RPCs and rereads the v2 state", async () => {
  const commands = [
    [
      { kind: "submit", milestone: 1, text: "Idea" },
      "v2_submit_peony_contribution",
      { p_flower_id: "x", p_milestone: 1, p_payload: { text: "Idea" } },
    ],
    [
      { kind: "submit", milestone: 3 },
      "v2_submit_peony_contribution",
      { p_flower_id: "x", p_milestone: 3, p_payload: {} },
    ],
    [
      { kind: "edit", id: 7, text: "Revised" },
      "v2_edit_peony_contribution",
      { p_contribution_id: 7, p_payload: { text: "Revised" } },
    ],
    [
      {
        kind: "plan",
        version: 4,
        activity: "Remote game",
        startsAt: "2026-11-03T01:30:00-08:00",
      },
      "v2_set_peony_plan",
      {
        p_flower_id: "x",
        p_expected_version: 4,
        p_activity: "Remote game",
        p_starts_at: "2026-11-03T01:30:00-08:00",
      },
    ],
    [{ kind: "accept", version: 4 }, "v2_accept_peony_plan", { p_flower_id: "x", p_plan_version: 4 }],
  ] as const;
  for (const [command, name, args] of commands) {
    rpc.mockReset().mockResolvedValue({ data: state, error: null });
    const result = await mutatePeonyV2("x", command);
    expect(rpc.mock.calls).toEqual([
      [name, args],
      ["v2_current_peony_state", { p_flower_id: "x" }],
    ]);
    expect(result).toMatchObject({ saved: true, error: null, state });
  }
});
it("rereads after rejection or ambiguous transport without leaking backend detail", async () => {
  for (const failure of [{ error: { code: "22023", message: "PRIVATE" } }, Error("network")]) {
    rpc.mockReset();
    if (failure instanceof Error) rpc.mockRejectedValueOnce(failure);
    else rpc.mockResolvedValueOnce(failure);
    rpc.mockResolvedValueOnce({ data: state, error: null });
    const result = await mutatePeonyV2("x", { kind: "accept", version: 2 });
    expect(result.saved).toBe(false);
    expect(result.state).toEqual(state);
    expect(result.error).not.toContain("PRIVATE");
    expect(rpc).toHaveBeenLastCalledWith("v2_current_peony_state", {
      p_flower_id: "x",
    });
  }
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  expect(await readPeonyV2("x")).toMatchObject({
    state: null,
    error: expect.stringMatching(/reconnect/),
  });
});
