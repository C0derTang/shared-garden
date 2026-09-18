// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { requireMember, rpc } = vi.hoisted(() => ({ requireMember: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember }));
import { readSettings, saveSetting } from "./actions";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
const state = { revision: 2, guide: "open", gentle_motion: false };
beforeEach(() => { vi.clearAllMocks(); requireMember.mockResolvedValue({ client: { rpc } }); rpc.mockResolvedValue({ data: state, error: null }); });
it("independently authorizes every read/write and sends no actor", async () => {
  expect((await readSettings()).state).toEqual(state);
  expect(rpc).toHaveBeenCalledWith("current_member_settings");
  expect((await saveSetting({ gentle_motion: false })).state).toEqual(state);
  expect(rpc).toHaveBeenLastCalledWith("save_member_setting", { p_change: { gentle_motion: false } });
  expect(requireMember).toHaveBeenCalledTimes(2);
});
it("rejects spoofed state before sending any mutation", async () => {
  const result = await saveSetting({ guide: "finished", cactus_checked_in: true });
  expect(result.state).toBeNull(); expect(result.error).toBeTruthy(); expect(rpc).not.toHaveBeenCalled();
});
it("does not claim persistence after a failed or malformed response", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { message: "private details" } });
  const result = await saveSetting({ guide: "skipped" });
  expect(result.state).toBeNull(); expect(result.error).not.toContain("private details");
  rpc.mockResolvedValueOnce({ data: { guide: "finished" }, error: null });
  expect((await readSettings()).state).toBeNull();
});
it("preserves denied redirects and reports transient authorization errors", async () => {
  requireMember.mockRejectedValueOnce(new Error("redirect:denied"));
  await expect(readSettings()).rejects.toThrow("redirect:denied");
  requireMember.mockRejectedValueOnce(new MemberAccessUnavailableError());
  expect((await readSettings()).state).toBeNull(); expect(rpc).not.toHaveBeenCalled();
});
