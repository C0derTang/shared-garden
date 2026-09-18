import { afterEach, expect, it, vi } from "vitest";
const { upload } = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/auth/browser", () => ({
  gardenBrowserClient: () => ({ storage: { from: () => ({ upload }) } }),
}));
import { photoInputError, savePhoto, type PhotoAttempt } from "./browser";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function json(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
it("retains original bytes and immutable intent across ambiguous upload/finalization retries", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      json({
        id: "media",
        status: "pending",
        staging_path: "media/source",
        mime_type: "image/png",
      }),
    )
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValueOnce(json({ status: "submitted" }));
  vi.stubGlobal("fetch", request);
  upload.mockRejectedValue(new Error("ambiguous upload"));
  const file = new File(["original"], "photo.png", { type: "image/png" });
  const attempt: PhotoAttempt = { requestId: "stable-key" };
  await expect(
    savePhoto(file, "flower", 42, attempt, () => {}),
  ).rejects.toThrow();
  await savePhoto(file, "flower", 42, attempt, () => {});
  expect(request.mock.calls.map((c) => c[0])).toEqual([
    "/api/media/intents",
    "/api/media/finalize",
    "/api/media/finalize",
  ]);
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({
    requestId: "stable-key",
    replacementEntryId: 42,
    byteLength: file.size,
  });
  expect(upload).toHaveBeenCalledWith("media/source", file, {
    contentType: "image/png",
    upsert: false,
  });
});
it("refuses finalization when day guard changes during upload", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      json({
        id: "media",
        status: "pending",
        staging_path: "media/source",
        mime_type: "image/png",
      }),
    );
  vi.stubGlobal("fetch", request);
  upload.mockResolvedValue({ error: null });
  const guard = vi
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementationOnce(() => {
      throw new Error("day changed");
    });
  await expect(
    savePhoto(
      new File(["x"], "p.png", { type: "image/png" }),
      "f",
      undefined,
      { requestId: "key" },
      guard,
    ),
  ).rejects.toThrow("day changed");
  expect(request).toHaveBeenCalledTimes(1);
});
it("rejects unsupported claimed types and oversized files before upload", () => {
  expect(
    photoInputError(new File(["x"], "fake.jpg", { type: "image/svg+xml" })),
  ).toMatch(/JPEG/);
  expect(
    photoInputError(
      new File([new Uint8Array(12 * 1024 * 1024 + 1)], "big.png", {
        type: "image/png",
      }),
    ),
  ).toMatch(/12 MiB/);
});
