// @vitest-environment node
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
const { config, verify, createClient, finish } = vi.hoisted(() => ({
  config: vi.fn(), verify: vi.fn(), createClient: vi.fn(), finish: vi.fn(),
}));
vi.mock("@/lib/auth/config", () => ({ getAuthConfig: config }));
vi.mock("@/lib/auth/member", () => ({ verifyMember: verify }));
vi.mock("@/lib/auth/client", async (original) => ({ ...await original(), createRequestClient: createClient }));
import { noStore } from "@/lib/auth/client";
import { GET, HEAD } from "./route";
let folder: string;
let file: string;
const bytes = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
const request = (range?: string, method = "GET") => new NextRequest("https://app.example.test/api/home/audio", {
  method, headers: range ? { Range: range } : undefined,
});
beforeAll(async () => {
  folder = await fs.mkdtemp(path.join(tmpdir(), "sunset-audio-test-"));
  file = path.join(folder, "synthetic.wav");
  await fs.writeFile(file, bytes);
});
afterAll(async () => { await fs.rm(folder, { recursive: true, force: true }); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUNSET_AUDIO_PATH", file);
  config.mockReturnValue({ appOrigin: "https://app.example.test" });
  verify.mockResolvedValue({ status: "allowed", member: { member_id: 1, member_role: "owner" } });
  finish.mockImplementation((response: NextResponse) => {
    response.cookies.set("refreshed-synthetic-session", "test");
    return noStore(response);
  });
  createClient.mockReturnValue({ client: {}, finish });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each([["signin", 401], ["denied", 403], ["unavailable", 503]] as const)("does not open a file for %s access", async (status, code) => {
  verify.mockResolvedValue({ status });
  const opened = vi.mocked(fs.open);
  const response = await GET(request());
  expect(response.status).toBe(code);
  expect(opened).not.toHaveBeenCalled();
  expect(await response.text()).toBe("");
  expect(response.headers.get("cache-control")).toContain("private");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("refreshed-synthetic-session");
});

it("fails closed when auth configuration is missing", async () => {
  config.mockReturnValue(null);
  const opened = vi.mocked(fs.open);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(createClient).not.toHaveBeenCalled();
  expect(opened).not.toHaveBeenCalled();
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("waits for live verification before accessing or streaming the configured file", async () => {
  let authorize!: (value: unknown) => void;
  verify.mockReturnValue(new Promise((resolve) => { authorize = resolve; }));
  const opened = vi.mocked(fs.open);
  const result = GET(request());
  await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
  expect(opened).not.toHaveBeenCalled();
  authorize({ status: "allowed" });
  const response = await result;
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(response.headers.get("content-length")).toBe("32");
  expect(response.headers.get("content-type")).toBe("audio/wav");
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("refreshed-synthetic-session");
});

it.each([
  ["bytes=0-0", 0, 0], ["bytes=3-9", 3, 9], ["bytes=28-", 28, 31],
  ["bytes=-4", 28, 31], ["bytes=30-99", 30, 31], ["bytes=-99", 0, 31],
] as const)("serves a bounded seek range %s", async (range, start, end) => {
  const response = await GET(request(range));
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/32`);
  expect(response.headers.get("content-length")).toBe(String(end - start + 1));
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(start, end + 1));
});

it.each(["bytes=32-", "bytes=9-3", "bytes=-0", "bytes=-", "items=0-1", "bytes=0-1,4-8", "bytes=999999999999999999-", "bytes=x-y"])("rejects invalid/unsatisfiable/multiple range %s without a body", async (range) => {
  const response = await GET(request(range));
  expect(response.status).toBe(416);
  expect(response.headers.get("content-range")).toBe("bytes */32");
  expect(await response.text()).toBe("");
  expect(response.headers.get("cache-control")).toContain("no-store");
});

it("supports authenticated HEAD metadata without a body and ignores its Range header", async () => {
  const response = await HEAD(request("bytes=0-1", "HEAD"));
  expect(response.status).toBe(200);
  expect(response.headers.get("content-length")).toBe("32");
  expect(response.headers.get("content-range")).toBeNull();
  expect(await response.text()).toBe("");
});

it("returns the full representation when an If-Range validator cannot be matched", async () => {
  const response = await GET(new NextRequest("https://app.example.test/api/home/audio", {
    headers: { Range: "bytes=0-1", "If-Range": '"old-version"' },
  }));
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
});

it("refuses configuration inside public static storage before opening it", async () => {
  vi.stubEnv("SUNSET_AUDIO_PATH", path.join(process.cwd(), "public", "private.wav"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(fs.open).not.toHaveBeenCalled();
});

it("closes an interrupted stream instead of retaining the private file handle", async () => {
  const large = path.join(folder, "synthetic-long.wav");
  await fs.writeFile(large, Buffer.alloc(200_000, 1));
  vi.stubEnv("SUNSET_AUDIO_PATH", large);
  const response = await GET(request());
  const handle = await vi.mocked(fs.open).mock.results[0].value;
  await response.body!.cancel();
  await expect(handle.stat()).rejects.toMatchObject({ code: "EBADF" });
});

it.each(["", "relative.wav", "/private/nonexistent-owned-audio.wav"])("hides missing/configuration errors", async (configured) => {
  vi.stubEnv("SUNSET_AUDIO_PATH", configured);
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe("");
  expect([...response.headers.values()].join(" ")).not.toContain(configured || "SUNSET_AUDIO_PATH");
});

it("rejects non-audio files and directories", async () => {
  for (const configured of [path.join(folder, "private.html"), folder]) {
    vi.stubEnv("SUNSET_AUDIO_PATH", configured);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  }
});

it("does not allow a URL parameter to select another file", async () => {
  const response = await GET(new NextRequest("https://app.example.test/api/home/audio?path=/private/secret.wav"));
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
});
