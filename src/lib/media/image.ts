import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const PHOTO_INPUT_LIMIT = 12 * 1024 * 1024;
export const PHOTO_OUTPUT_LIMIT = 32 * 1024 * 1024;
export const PHOTO_PIXEL_LIMIT = 25_000_000;
export const PHOTO_SIDE_LIMIT = 12_000;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number];
export class MediaError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}

// libvips may report an APNG as a single PNG with no `pages` metadata. Walk
// actual chunk boundaries, not substring matches inside compressed pixel data.
function assertStaticPng(input: Buffer) {
  let offset = 8; // PNG signature, already recognized by the decoder.
  while (offset < input.length) {
    if (input.length - offset < 12) throw new MediaError("invalid_photo");
    const length = input.readUInt32BE(offset);
    if (length > input.length - offset - 12)
      throw new MediaError("invalid_photo");
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (type === "acTL" || type === "fcTL" || type === "fdAT")
      throw new MediaError("unsupported_photo");
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0 || offset !== input.length)
        throw new MediaError("invalid_photo");
      return;
    }
  }
  throw new MediaError("invalid_photo");
}

export async function sanitizePhoto(input: Buffer, claimedType: string) {
  if (!(PHOTO_TYPES as readonly string[]).includes(claimedType))
    throw new MediaError("unsupported_photo");
  if (!input.length || input.length > PHOTO_INPUT_LIMIT)
    throw new MediaError("photo_too_large");
  try {
    const decoder = sharp(input, {
      failOn: "warning",
      limitInputPixels: PHOTO_PIXEL_LIMIT,
      sequentialRead: true,
    });
    const metadata = await decoder.metadata();
    const types: Record<string, PhotoType> = {
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const type = types[metadata.format ?? ""];
    if (!type || (metadata.pages ?? 1) !== 1)
      throw new MediaError("unsupported_photo");
    if (type !== claimedType) throw new MediaError("type_mismatch");
    if (type === "image/png") assertStaticPng(input);
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > PHOTO_SIDE_LIMIT ||
      metadata.height > PHOTO_SIDE_LIMIT
    )
      throw new MediaError("photo_too_large");
    // Re-encoding decodes all pixels. No resize/crop and no metadata retention.
    // Orient first so removing EXIF does not change the visible composition.
    let pipeline = decoder
      .autoOrient()
      .toColourspace("srgb")
      .timeout({ seconds: 20 });
    if (type === "image/jpeg")
      pipeline = pipeline.jpeg({ quality: 95, chromaSubsampling: "4:4:4" });
    else if (type === "image/png")
      pipeline = pipeline.png({ compressionLevel: 6 });
    else pipeline = pipeline.webp({ lossless: true, effort: 1 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    if (data.length > PHOTO_OUTPUT_LIMIT)
      throw new MediaError("photo_too_large");
    return {
      bytes: data,
      mimeType: type,
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("invalid_photo");
  }
}
