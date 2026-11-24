// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { readAchievementsV2, readAwardsForDayV2 } from "./achievement-actions";

const dayAwards = {
  server_now: "2026-11-02T18:00:00Z",
  garden_day: "2026-11-02",
  day: "2026-11-02",
  earned: false,
  awards: [],
};
beforeEach(() => {
  rpc.mockReset();
  guard.mockReset().mockResolvedValue({ client: { rpc } });
});
it("checks live membership before every read", async () => {
  guard.mockRejectedValue(Error("denied"));
  await expect(readAchievementsV2()).rejects.toThrow("denied");
  await expect(readAwardsForDayV2()).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("calls only the v2 RPCs", async () => {
  rpc.mockResolvedValue({ data: dayAwards, error: null });
  expect((await readAwardsForDayV2()).state?.earned).toBe(false);
  expect(rpc).toHaveBeenLastCalledWith("v2_awards_for_day", {});
  await readAwardsForDayV2("2026-11-01");
  expect(rpc).toHaveBeenLastCalledWith("v2_awards_for_day", {
    p_day: "2026-11-01",
  });
  rpc.mockResolvedValue({ data: { achievements: [] }, error: null });
  expect((await readAchievementsV2()).state).toBeNull();
  expect(rpc).toHaveBeenLastCalledWith("v2_current_achievements");
});
it("rejects malformed days before the database and hides backend detail", async () => {
  expect((await readAwardsForDayV2("tomorrow")).state).toBeNull();
  expect(rpc).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: null, error: { message: "PRIVATE_DETAIL" } });
  expect(JSON.stringify(await readAwardsForDayV2())).not.toContain("PRIVATE_DETAIL");
  expect(JSON.stringify(await readAchievementsV2())).not.toContain("PRIVATE_DETAIL");
  guard.mockRejectedValue(new MemberAccessUnavailableError());
  expect(await readAchievementsV2()).toEqual({
    state: null,
    error: expect.stringMatching(/could not refresh/),
  });
});
