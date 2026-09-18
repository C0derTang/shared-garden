import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireMember: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: auth.requireMember }));
import { readPrivateInteraction, controlPrivateInteraction, previewPrivateInteraction, answerPrivateInteraction } from "./actions";
beforeEach(() => {
  vi.clearAllMocks();
  auth.requireMember.mockResolvedValue({ member: { member_id: 2, member_role: "member" }, client: { rpc: auth.rpc } });
});
it("denies partner admin and preview before querying private data", async () => {
  expect((await controlPrivateInteraction("arm", true)).state).toBeNull();
  expect((await previewPrivateInteraction()).content).toBeNull();
  expect(auth.rpc).not.toHaveBeenCalled();
});
it("uses server member role rather than request data for reads", async () => {
  auth.rpc.mockResolvedValue({ data: { status: "unavailable", content: { message: "should not escape" } }, error: null });
  expect(await readPrivateInteraction()).toEqual({ state: { status: "unavailable" }, error: null });
  expect(auth.rpc).toHaveBeenCalledWith("current_private_interaction");
});
it("rejects malformed answers and contains backend error details", async () => {
  expect((await answerPrivateInteraction("bad key")).error).toBeTruthy();
  expect(auth.rpc).not.toHaveBeenCalled();
  auth.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
  expect((await answerPrivateInteraction("a")).error).not.toContain("private detail");
});
it("reads owner status only after server authorization", async () => {
  auth.requireMember.mockResolvedValue({ member: { member_id: 1, member_role: "owner" }, client: { rpc: auth.rpc } });
  auth.rpc.mockResolvedValue({ data: { status: "ready", armed: true, unread: false, answer: null }, error: null });
  expect((await readPrivateInteraction()).state?.status).toBe("owner");
  expect(auth.rpc).toHaveBeenCalledWith("owner_private_interaction", { p_action: "status" });
});
