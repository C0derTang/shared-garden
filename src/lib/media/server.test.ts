// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const { trusted, sanitizePhoto, sanitizeAudio } = vi.hoisted(() => ({
  trusted: { rpc: vi.fn(), storage: { from: vi.fn() } },
  sanitizePhoto: vi.fn(),
  sanitizeAudio: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/config", () => ({
  getAuthConfig: () => ({ supabaseUrl: "https://backend.example.test" }),
}));
vi.mock("@/lib/config/server", () => ({
  getServerConfig: () => ({
    status: "ready",
    config: { supabaseSecretKey: "sb_secret_synthetic" },
  }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => trusted }));
vi.mock("./image", async () => {
  const { MediaError } = await import("./error");
  return { MediaError, PHOTO_INPUT_LIMIT: 12 * 1024 * 1024, sanitizePhoto };
});
vi.mock("./audio", () => ({ sanitizeAudio }));
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupMedia, finalizeMedia, readPhoto } from "./server";

afterEach(() => vi.clearAllMocks());

type Call = [string, ...unknown[]];
function storage(calls: Call[]) {
  trusted.storage.from.mockImplementation((bucket: string) => ({
    download: async (path: string) => {
      calls.push(["download", bucket, path]);
      return { data: new Blob(["staged"]), error: null };
    },
    upload: async (path: string) => {
      calls.push(["upload", bucket, path]);
      return { error: null };
    },
    remove: async (paths: string[]) => {
      calls.push(["remove", bucket, ...paths]);
      return { error: null };
    },
    createSignedUrl: async (path: string) => {
      calls.push(["sign", bucket, path]);
      return {
        data: { signedUrl: "https://backend.example.test/s" },
        error: null,
      };
    },
  }));
}
function member(calls: Call[], claim: object) {
  return {
    rpc: vi.fn(async (name: string, args: object) => {
      calls.push(["member", name, args]);
      if (name.endsWith("claim_media_upload"))
        return { data: claim, error: null };
      if (name.endsWith("media_read_path"))
        return {
          data: {
            path: "m/photo.png",
            mime_type: "image/png",
            width: 1,
            height: 1,
          },
          error: null,
        };
      return { data: { id: 9 }, error: null };
    }),
  } as unknown as SupabaseClient;
}
const claim = (mime: string, replacement: number | null = null) => ({
  id: "m",
  flower_id: "f",
  replacement_entry_id: replacement,
  status: "processing",
  expires_at: "2026-11-24T00:00:00Z",
  mime_type: mime,
  input_bytes: 6,
  staging_path: "m/source",
  final_path: mime === "audio/webm" ? "m/audio.wav" : "m/photo.png",
  entry_id: null,
  lease_id: "lease",
});

it("finalizes v2 photos and voice memos only through v2 RPCs and buckets", async () => {
  sanitizePhoto.mockResolvedValue({
    bytes: Buffer.from("png"),
    mimeType: "image/png",
    width: 1,
    height: 1,
    sha256: "a".repeat(64),
  });
  sanitizeAudio.mockResolvedValue({
    bytes: Buffer.from("wav"),
    mimeType: "audio/wav",
    samples: 1,
    channels: 1,
    sha256: "b".repeat(64),
  });
  trusted.rpc.mockResolvedValue({ data: null, error: null });
  for (const [mime, attest, save] of [
    ["image/png", "v2_attest_media_upload", "v2_submit_flower_entry"],
    ["audio/webm", "v2_attest_audio_upload", "v2_edit_flower_entry"],
  ] as const) {
    const calls: Call[] = [];
    storage(calls);
    const replacement = save === "v2_edit_flower_entry" ? 4 : null;
    const client = member(calls, claim(mime, replacement));
    await expect(finalizeMedia(client, "m", "v2")).resolves.toEqual({
      mediaId: "m",
      entryId: 9,
      status: "submitted",
    });
    expect(calls.map((c) => c.slice(0, 2))).toEqual([
      ["member", "v2_claim_media_upload"],
      ["download", "garden-v2-staging"],
      ["upload", "garden-v2-media"],
      ["member", save],
    ]);
    expect(trusted.rpc.mock.calls.at(-1)?.[0]).toBe(attest);
  }
});

it("keeps legacy finalization, reads and cleanup on legacy names by default", async () => {
  sanitizePhoto.mockResolvedValue({
    bytes: Buffer.from("png"),
    mimeType: "image/png",
    width: 1,
    height: 1,
    sha256: "a".repeat(64),
  });
  trusted.rpc.mockResolvedValue({ data: null, error: null });
  const calls: Call[] = [];
  storage(calls);
  const client = member(calls, claim("image/png"));
  await finalizeMedia(client, "m");
  await readPhoto(client, "m");
  expect(calls.map((c) => c.slice(0, 2))).toEqual([
    ["member", "claim_media_upload"],
    ["download", "garden-staging"],
    ["upload", "garden-media"],
    ["member", "submit_flower_entry"],
    ["member", "media_read_path"],
    ["sign", "garden-media"],
  ]);
  expect(trusted.rpc.mock.calls.map((c) => c[0])).toEqual([
    "attest_media_upload",
  ]);
});

it("signs v2 reads and sweeps v2 cleanup only in v2 buckets", async () => {
  const calls: Call[] = [];
  storage(calls);
  const client = member(calls, claim("image/png"));
  await expect(readPhoto(client, "m", "v2")).resolves.toMatchObject({
    mediaId: "m",
    expiresIn: 60,
  });
  trusted.rpc.mockImplementation(async (name: string) =>
    name === "v2_media_cleanup_candidates"
      ? {
          data: [
            { id: "x", staging_path: "x/source", final_path: "x/photo.png" },
          ],
          error: null,
        }
      : { data: null, error: null },
  );
  await expect(cleanupMedia("v2")).resolves.toEqual({ cleaned: 1 });
  expect(calls.map((c) => c.slice(0, 3))).toEqual([
    ["member", "v2_media_read_path", { p_id: "m" }],
    ["sign", "garden-v2-media", "m/photo.png"],
    ["remove", "garden-v2-staging", "x/source"],
    ["remove", "garden-v2-media", "x/photo.png"],
  ]);
  expect(trusted.rpc.mock.calls.map((c) => c[0])).toEqual([
    "v2_media_cleanup_candidates",
    "v2_media_cleanup_done",
  ]);
});
