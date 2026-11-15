// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { config, verify, rpc, createClient, cookieStore } = vi.hoisted(() => ({
  config: vi.fn(),
  verify: vi.fn(),
  rpc: vi.fn(),
  createClient: vi.fn(),
  cookieStore: vi.fn(),
}));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: config }));
vi.mock("@/lib/auth/member", () => ({ verifyMember: verify }));
vi.mock("@supabase/ssr", () => ({ createServerClient: createClient }));
vi.mock("next/headers", () => ({ cookies: cookieStore }));
import { loadLandingAccess } from "./access";

const authConfig = {
  appOrigin: "https://app.example.test",
  supabaseUrl: "https://backend.example.test",
  supabasePublishableKey: "sb_publishable_synthetic",
};
beforeEach(() => {
  vi.clearAllMocks();
  config.mockReturnValue(authConfig);
  cookieStore.mockResolvedValue({ getAll: () => [] });
  createClient.mockReturnValue({ rpc });
  verify.mockResolvedValue({
    status: "allowed",
    member: { member_id: 1, member_role: "owner" },
  });

});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("returns the login-only visitor state when auth is not configured", async () => {
  config.mockReturnValue(null);
  expect(await loadLandingAccess()).toEqual({ status: "visitor" });
  expect(cookieStore).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
  expect(verify).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it.each(["signin", "denied", "unavailable"])(
  "never loads private entries for a %s session",
  async (status) => {
    verify.mockResolvedValue({ status });
    expect(await loadLandingAccess()).toEqual({ status: "visitor" });
    expect(rpc).not.toHaveBeenCalled();
  },
);

it("treats thrown verification or client setup failures as a visitor", async () => {
  verify.mockRejectedValue(new Error("PRIVATE_BACKEND_DETAIL"));
  expect(await loadLandingAccess()).toEqual({ status: "visitor" });
  createClient.mockImplementation(() => {
    throw new Error("bad client");
  });
  expect(await loadLandingAccess()).toEqual({ status: "visitor" });
  cookieStore.mockRejectedValue(new Error("no request"));
  expect(await loadLandingAccess()).toEqual({ status: "visitor" });
  expect(rpc).not.toHaveBeenCalled();
});

it("reads the session with the shared auth cookie and never writes cookies", async () => {
  await loadLandingAccess();
  const [url, key, options] = createClient.mock.calls[0];
  expect(url).toBe(authConfig.supabaseUrl);
  expect(key).toBe(authConfig.supabasePublishableKey);
  expect(options.cookieOptions).toMatchObject({ name: "sg-auth", path: "/", secure: true });
  expect(() => options.cookies.setAll([{ name: "sg-auth", value: "x", options: {} }])).not.toThrow();
  expect(verify).toHaveBeenCalledWith({ rpc });
});

it("forces the server client's network reads to bypass shared caches", async () => {
  const network = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
  await loadLandingAccess();
  const options = createClient.mock.calls[0][2];
  await options.global.fetch("https://backend.example.test/data", { cache: "force-cache" });
  expect(network).toHaveBeenCalledWith("https://backend.example.test/data", { cache: "no-store" });
});

it("returns only membership after verification without reading memories or profiles", async () => {
  let authorize!: (result: unknown) => void;
  verify.mockReturnValue(new Promise((resolve) => { authorize = resolve; }));
  const result = loadLandingAccess();
  await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
  expect(rpc).not.toHaveBeenCalled();
  authorize({ status: "allowed", member: { member_id: 1, member_role: "owner" } });
  expect(await result).toEqual({ status: "member" });
  expect(rpc).not.toHaveBeenCalled();
});
