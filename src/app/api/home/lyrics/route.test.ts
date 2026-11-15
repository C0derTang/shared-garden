// @vitest-environment node
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open), realpath: vi.fn(actual.realpath) };
});
const { config, verify, createClient, finish } = vi.hoisted(() => ({
  config: vi.fn(), verify: vi.fn(), createClient: vi.fn(), finish: vi.fn(),
}));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: config }));
vi.mock("@/lib/auth/member", () => ({ verifyMember: verify }));
vi.mock("@/lib/auth/client", async (original) => ({ ...await original(), createRequestClient: createClient }));
import { noStore } from "@/lib/auth/client";
import { GET } from "./route";

let folder: string;
let file: string;
const payload = { version: 1, cues: [{ start: 1, end: 3, text: "Synthetic fixture" }] };
const request = () => new NextRequest("https://app.example.test/api/home/lyrics?path=/private/ignored.json");
beforeAll(async () => {
  folder = await fs.mkdtemp(path.join(tmpdir(), "sunset-lyrics-test-"));
  file = path.join(folder, "synthetic.json");
  await fs.writeFile(file, JSON.stringify({ ...payload, source: "private metadata" }));
});
afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUNSET_LYRICS_PATH", file);
  config.mockReturnValue({ appOrigin: "https://app.example.test" });
  verify.mockResolvedValue({ status: "allowed" });
  finish.mockImplementation((response: NextResponse) => {
    response.cookies.set("refreshed-synthetic-session", "test");
    return noStore(response);
  });
  createClient.mockReturnValue({ client: {}, finish });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each([["signin", 401], ["denied", 403], ["unavailable", 503]] as const)("does not inspect a file for %s access", async (status, code) => {
  verify.mockResolvedValue({ status });
  const response = await GET(request());
  expect(response.status).toBe(code);
  expect(fs.open).not.toHaveBeenCalled();
  expect(fs.realpath).not.toHaveBeenCalled();
  expect(await response.text()).toBe("");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("refreshed-synthetic-session");
});

it("fails closed without auth configuration", async () => {
  config.mockReturnValue(null);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(fs.open).not.toHaveBeenCalled();
  expect(createClient).not.toHaveBeenCalled();
});

it("waits for live membership and returns only safe cues with refreshed cookies", async () => {
  let authorize!: (value: unknown) => void;
  verify.mockReturnValue(new Promise((resolve) => { authorize = resolve; }));
  const pending = GET(request());
  await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
  expect(fs.open).not.toHaveBeenCalled();
  authorize({ status: "allowed" });
  const response = await pending;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(payload);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("refreshed-synthetic-session");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  const handle = await vi.mocked(fs.open).mock.results[0].value;
  await expect(handle.stat()).rejects.toMatchObject({ code: "EBADF" });
});

it.each(["", "relative.json", "/private/missing-cues.json"])("hides absent or invalid private configuration", async (configured) => {
  vi.stubEnv("SUNSET_LYRICS_PATH", configured);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("");
});

it("rejects public static storage, including a symlink to it", async () => {
  vi.stubEnv("SUNSET_LYRICS_PATH", path.join(process.cwd(), "public", "private.json"));
  expect((await GET(request())).status).toBe(503);
  expect(fs.open).not.toHaveBeenCalled();
  vi.stubEnv("SUNSET_LYRICS_PATH", file);
  vi.mocked(fs.realpath).mockResolvedValueOnce(path.join(process.cwd(), "public", "private.json"));
  expect((await GET(request())).status).toBe(503);
  expect(fs.open).not.toHaveBeenCalled();
});

it("rejects oversized, malformed and invalid cue files without leaking their contents", async () => {
  for (const [name, body] of [
    ["large.json", "x".repeat(256 * 1024 + 1)], ["invalid.json", "PRIVATE_DATA"],
    ["bad-cues.json", JSON.stringify({ version: 1, cues: [{ start: 3, end: 1, text: "PRIVATE_DATA" }] })],
  ]) {
    const selected = path.join(folder, name);
    await fs.writeFile(selected, body);
    vi.stubEnv("SUNSET_LYRICS_PATH", selected);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  }
});
