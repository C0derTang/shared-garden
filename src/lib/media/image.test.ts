// @vitest-environment node
import sharp from "sharp";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { sanitizePhoto } from "./image";

it.each([
  [640, 360],
  [360, 640],
])("preserves %s x %s pixels without cropping", async (width, height) => {
  const source = await sharp({
    create: { width, height, channels: 3, background: "#965f39" },
  })
    .png()
    .toBuffer();
  const result = await sanitizePhoto(source, "image/png");
  const decoded = await sharp(result.bytes).metadata();
  expect([result.width, result.height, decoded.width, decoded.height]).toEqual([
    width,
    height,
    width,
    height,
  ]);
  expect(decoded.exif).toBeUndefined();
});
it("applies EXIF orientation before dropping EXIF and GPS", async () => {
  const source = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#508061" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExifMerge({
      IFD0: { Artist: "Synthetic fixture" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "1/1 2/1 3/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "4/1 5/1 6/1",
      },
    })
    .toBuffer();
  const sourceExif = (await sharp(source).metadata()).exif!;
  expect(sourceExif).toBeDefined();
  // This synthetic little-endian EXIF has an actual GPS IFD pointer (0x8825).
  const ifd = 6 + sourceExif.readUInt32LE(10);
  const tags = Array.from({ length: sourceExif.readUInt16LE(ifd) }, (_, i) =>
    sourceExif.readUInt16LE(ifd + 2 + i * 12),
  );
  expect(tags).toContain(0x8825);
  const result = await sanitizePhoto(source, "image/jpeg");
  const decoded = await sharp(result.bytes).metadata();
  expect([result.width, result.height, decoded.width, decoded.height]).toEqual([
    600, 800, 600, 800,
  ]);
  expect(decoded.orientation).toBeUndefined();
  expect(decoded.exif).toBeUndefined();
  expect(decoded.xmp).toBeUndefined();
});
it.each(["image/svg+xml", "text/html", "image/heic", "audio/webm"])(
  "rejects unsupported %s",
  async (mime) => {
    await expect(
      sanitizePhoto(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        mime,
      ),
    ).rejects.toMatchObject({ code: "unsupported_photo" });
  },
);
it("rejects malformed, truncated, type-spoofed and oversized inputs", async () => {
  await expect(
    sanitizePhoto(Buffer.from("<html>bad</html>"), "image/jpeg"),
  ).rejects.toMatchObject({ code: "invalid_photo" });
  const png = await sharp({
    create: { width: 40, height: 20, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await expect(sanitizePhoto(png, "image/jpeg")).rejects.toMatchObject({
    code: "type_mismatch",
  });
  await expect(
    sanitizePhoto(png.subarray(0, png.length - 40), "image/png"),
  ).rejects.toMatchObject({ code: "invalid_photo" });
  await expect(
    sanitizePhoto(Buffer.alloc(12 * 1024 * 1024 + 1), "image/png"),
  ).rejects.toMatchObject({ code: "photo_too_large" });
  const large = await sharp({
    create: { width: 5001, height: 5000, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await expect(sanitizePhoto(large, "image/png")).rejects.toMatchObject({
    code: "invalid_photo",
  });
});
it("preserves WebP dimensions and rejects animated resources", async () => {
  const webp = await sharp({
    create: { width: 200, height: 100, channels: 4, background: "#abcd" },
  })
    .webp()
    .toBuffer();
  const result = await sanitizePhoto(webp, "image/webp");
  expect([result.width, result.height]).toEqual([200, 100]);
  const animated = await sharp(
    Buffer.from([
      ...Array(4).fill([255, 0, 0]).flat(),
      ...Array(4).fill([0, 0, 255]).flat(),
    ]),
    { raw: { width: 2, height: 4, channels: 3, pageHeight: 2 } },
  )
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animated).metadata()).pages).toBe(2);
  await expect(sanitizePhoto(animated, "image/webp")).rejects.toMatchObject({
    code: "unsupported_photo",
  });
});

it.each([
  [1, [1, 2, 3, 4, 5, 6]],
  [2, [2, 1, 4, 3, 6, 5]],
  [3, [6, 5, 4, 3, 2, 1]],
  [4, [5, 6, 3, 4, 1, 2]],
  [5, [1, 3, 5, 2, 4, 6]],
  [6, [5, 3, 1, 6, 4, 2]],
  [7, [6, 4, 2, 5, 3, 1]],
  [8, [2, 4, 6, 1, 3, 5]],
] as const)(
  "normalizes visible pixel orientation %s, including mirrored EXIF",
  async (orientation, expected) => {
    const raw = Buffer.from([1, 2, 3, 4, 5, 6].flatMap((n) => [n * 30, 0, 0]));
    const source = await sharp(raw, {
      raw: { width: 2, height: 3, channels: 3 },
    })
      .png()
      .withMetadata({ orientation })
      .toBuffer();
    const result = await sanitizePhoto(source, "image/png");
    const pixels = await sharp(result.bytes).removeAlpha().raw().toBuffer();
    expect(Array.from(pixels).filter((_, i) => i % 3 === 0)).toEqual(
      expected.map((n) => n * 30),
    );
    expect([result.width, result.height]).toEqual(
      orientation >= 5 ? [3, 2] : [2, 3],
    );
  },
);

it("rejects a real two-frame APNG even when Sharp omits frame metadata", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(
    new URL("../../test/fixtures/two-frame.apng", import.meta.url),
  );
  const metadata = await sharp(source).metadata();
  expect(metadata.format).toBe("png");
  expect(metadata.pages).toBeUndefined();
  await expect(sanitizePhoto(source, "image/png")).rejects.toMatchObject({
    code: "unsupported_photo",
  });
});

it("does not mistake animation words inside static PNG metadata for chunks", async () => {
  const source = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .withExif({ IFD0: { ImageDescription: "acTL fcTL fdAT" } })
    .toBuffer();
  expect(source.includes(Buffer.from("acTL fcTL fdAT"))).toBe(true);
  const result = await sanitizePhoto(source, "image/png");
  expect([result.width, result.height]).toEqual([20, 10]);
  expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
});
