// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { rpc, guard } = vi.hoisted(() => ({ rpc: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
import { readAchievements } from "./actions";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
beforeEach(() => {
  rpc.mockReset();
  guard.mockReset().mockResolvedValue({ client: { rpc } });
});
it("checks live membership before making a safe no-input read", async () => {
  guard.mockRejectedValue(Error("denied"));
  await expect(readAchievements()).rejects.toThrow("denied");
  expect(rpc).not.toHaveBeenCalled();
});
it("reports transient membership and malformed-state failures without inventing progress", async () => {
  guard.mockRejectedValueOnce(new MemberAccessUnavailableError());
  expect((await readAchievements()).state).toBeNull();
  rpc.mockResolvedValue({ data: { achievements: [] }, error: null });
  expect((await readAchievements()).state).toBeNull();
  expect(rpc).toHaveBeenCalledWith("current_achievements");
});
