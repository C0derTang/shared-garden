// @vitest-environment node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const { sanitize } = vi.hoisted(() => ({ sanitize: vi.fn() }));
vi.mock("@/lib/media/audio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/audio")>();
  sanitize.mockImplementation(actual.sanitizeAudio);
  return { ...actual, sanitizeAudio: sanitize };
});

import {
  FIXTURE_SHA256,
  handleSmokeRequest,
  MIN_TOKEN_LENGTH,
} from "../../tools/native-smoke/handler";

const TOKEN = "x".repeat(MIN_TOKEN_LENGTH + 16);
const request = (authorization?: string) =>
  handleSmokeRequest(
    new Headers(authorization ? { authorization } : undefined),
  );

it("generates pinned build dependencies for a clean TypeScript install", () => {
  const target = mkdtempSync(path.join(tmpdir(), "native-smoke-"));
  try {
    execFileSync(process.execPath, ["tools/native-smoke/generate.mjs", target]);
    const generated = JSON.parse(readFileSync(path.join(target, "package.json"), "utf8"));
    const application = JSON.parse(readFileSync("package.json", "utf8"));
    expect(Object.keys(generated.devDependencies ?? {}).sort()).toEqual([
      "@types/node", "@types/react", "typescript",
    ]);
    for (const name of ["typescript", "@types/react", "@types/node"]) {
      expect(generated.devDependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
      expect(generated.devDependencies[name]).toBe(application.devDependencies[name]);
    }
    expect(Object.keys(generated.dependencies).sort()).toEqual([
      "next", "react", "react-dom", "server-only",
    ]);
    expect(existsSync(path.join(target, "node_modules"))).toBe(false);
    expect(existsSync(path.join(target, ".vercel"))).toBe(false);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

beforeEach(() => {
  sanitize.mockClear();
  process.env.NATIVE_SMOKE_TOKEN = TOKEN;
});
afterEach(() => {
  delete process.env.NATIVE_SMOKE_TOKEN;
});

it("reports an absent probe and decodes nothing without a configured token", async () => {
  delete process.env.NATIVE_SMOKE_TOKEN;
  expect(await request(`Bearer ${TOKEN}`)).toEqual({
    status: 503,
    body: { error: "smoke_unavailable" },
  });
  expect(sanitize).not.toHaveBeenCalled();
});

it("refuses a configured token below the entropy floor", async () => {
  const weak = "y".repeat(MIN_TOKEN_LENGTH - 1);
  process.env.NATIVE_SMOKE_TOKEN = weak;
  expect(await request(`Bearer ${weak}`)).toEqual({
    status: 503,
    body: { error: "smoke_unavailable" },
  });
  expect(sanitize).not.toHaveBeenCalled();
});

it.each([
  ["absent", undefined],
  ["empty", ""],
  ["a bare scheme", "Bearer"],
  ["a lowercase scheme", `bearer ${TOKEN}`],
  ["another scheme", `Basic ${TOKEN}`],
  ["a padded value", `Bearer  ${TOKEN}`],
  ["an unbounded character", `Bearer ${TOKEN.slice(0, -1)}§`],
  ["an over-long value", `Bearer ${"z".repeat(513)}`],
])("denies %s authorization before decoding", async (_label, header) => {
  expect(await request(header)).toEqual({
    status: 401,
    body: { error: "unauthorized" },
  });
  expect(sanitize).not.toHaveBeenCalled();
});

it.each([
  ["a wrong token of the same length", "w".repeat(MIN_TOKEN_LENGTH + 16)],
  ["a prefix of the token", TOKEN.slice(0, MIN_TOKEN_LENGTH)],
  ["the token with an extra character", `${TOKEN}0`],
])("denies %s before decoding", async (_label, value) => {
  expect(await request(`Bearer ${value}`)).toEqual({
    status: 401,
    body: { error: "unauthorized" },
  });
  expect(sanitize).not.toHaveBeenCalled();
});

const decoder = path.join(
  process.cwd(),
  "vendor/audio",
  `${process.platform}-${process.arch}`,
);
// The production target is Linux amd64, whose programs are versioned here, so
// this runs in CI. A developer machine without a local build of the identical
// source has no decoder to exercise and is skipped rather than failed.
it.skipIf(!existsSync(decoder))(
  "returns only bounded sanitized evidence for an authorized probe",
  async () => {
    const { status, body } = await request(`Bearer ${TOKEN}`);
    expect(status).toBe(200);
    expect(sanitize).toHaveBeenCalledTimes(1);
    expect(Object.keys(body).sort()).toEqual([
      "arch",
      "channels",
      "decoder",
      "durationMs",
      "elapsedMs",
      "fixtureSha256",
      "nodeVersion",
      "outputSha256",
      "platform",
      "sampleRate",
      "samples",
    ]);
    expect(body).toMatchObject({
      fixtureSha256: FIXTURE_SHA256,
      outputSha256:
        "b0cbcac4f5beb40f2dc3fea08803282e1a47ac0b88ee2184209048617e5352f8",
      samples: 240000,
      sampleRate: 48000,
      channels: 1,
      durationMs: 5000,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    });
    expect(body.decoder).toMatch(/^ffprobe version 9\.0\.1\b/);
    expect(typeof body.elapsedMs).toBe("number");
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(TOKEN);
    expect(serialized).not.toContain(process.cwd());
    expect(serialized).not.toContain("/");
    expect(serialized).not.toMatch(/NATIVE_SMOKE_TOKEN|SUPABASE|sb_secret_/);
  },
  120000,
);

it("keeps the template out of every application module", () => {
  const here = path.join(process.cwd(), "src/test/native-smoke.test.ts");
  const offenders: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(entry.name) && file !== here) {
        const source = readFileSync(file, "utf8");
        if (/from\s+["'][^"']*\btools\//.test(source)) offenders.push(file);
      }
    }
  };
  walk(path.join(process.cwd(), "src"));
  expect(offenders).toEqual([]);
});
