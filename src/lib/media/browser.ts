"use client";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { mediaBuckets, mediaGardenField, type MediaGarden } from "./garden";

export { mediaGardenField };

export const photoTypes = ["image/jpeg", "image/png", "image/webp"];
export const photoAccept = photoTypes.join(",");
export function photoInputError(file: File): string | null {
  if (!photoTypes.includes(file.type))
    return "Choose or export a JPEG, PNG, or WebP photo. HEIC, SVG and animated images are not supported.";
  if (!file.size || file.size > 12 * 1024 * 1024)
    return "Choose a photo up to 12 MiB. We never shrink or crop your photo.";
  return null;
}
export class MediaError extends Error {
  constructor(public code: string) {
    super(mediaMessage(code));
  }
}
function mediaMessage(code: string) {
  if (
    [
      "unsupported_photo",
      "invalid_photo",
      "type_mismatch",
      "photo_too_large",
      "photo_size_mismatch",
    ].includes(code)
  )
    return "This photo could not be accepted. Choose a valid JPEG, PNG or static WebP up to 12 MiB and 25 million pixels, with each side at most 12,000 pixels. Export another photo without cropping or shrinking it.";
  if (code === "media_processing")
    return "Your photo may still be processing. Check today's entries and wait two minutes before retrying this photo.";
  if (code === "upload_missing")
    return "The upload was interrupted. Keep this photo and retry when connected.";
  if (code === "entry_rejected" || code.startsWith("media_expired"))
    return "The care or edit window changed. Check today's entries; your previous saved photo is kept. Choose a photo again only if care is still available.";
  if (code === "media_upload_limit")
    return "Too many unfinished uploads. Wait for them to expire, then try again.";
  if (["signin_required", "media_not_available"].includes(code))
    return "Photo access could not be verified. Sign in again to your garden.";
  return "We could not confirm the photo save. Check today's entries before retrying this same photo.";
}
export async function mediaRequest<T>(
  operation: string,
  body: object,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/media/${operation}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    redirect: "error",
    signal,
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new MediaError("signin_required");
  const result = await response.json();
  if (!response.ok) throw new MediaError(result.error ?? "media_unavailable");
  return result as T;
}
export type MediaAttempt = {
  requestId: string;
  intent?: {
    id: string;
    staging_path: string;
    mime_type: string;
    status: string;
  };
};
export type PhotoAttempt = MediaAttempt;
/**
 * Where a save is: reserving its private intent, sending the bytes to private
 * staging, then the server's check and entry. The Storage client reports no
 * byte progress, so these steps are the progress a form can show.
 */
export type MediaStage = "reserving" | "uploading" | "checking";
// New-garden callers pass garden "v2"; the legacy default sends no
// discriminator, so legacy requests are byte-for-byte unchanged.
export async function savePhoto(
  file: File,
  flowerId: string,
  replacementEntryId: number | undefined,
  attempt: PhotoAttempt,
  checkCurrent: () => void,
  garden: MediaGarden = "legacy",
  onStage?: (stage: MediaStage) => void,
) {
  return saveMedia(
    file,
    file.type,
    flowerId,
    replacementEntryId,
    attempt,
    checkCurrent,
    garden,
    onStage,
  );
}
export async function saveVoice(
  file: File,
  flowerId: string,
  replacementEntryId: number | undefined,
  attempt: MediaAttempt,
  checkCurrent: () => void,
  garden: MediaGarden = "legacy",
  onStage?: (stage: MediaStage) => void,
) {
  return saveMedia(
    file,
    "audio/webm",
    flowerId,
    replacementEntryId,
    attempt,
    checkCurrent,
    garden,
    onStage,
  );
}
async function saveMedia(
  file: File,
  mimeType: string,
  flowerId: string,
  replacementEntryId: number | undefined,
  attempt: MediaAttempt,
  checkCurrent: () => void,
  garden: MediaGarden,
  onStage?: (stage: MediaStage) => void,
) {
  checkCurrent();
  onStage?.("reserving");
  attempt.intent ??= await mediaRequest("intents", {
    requestId: attempt.requestId,
    flowerId,
    mimeType,
    byteLength: file.size,
    ...(replacementEntryId ? { replacementEntryId } : {}),
    ...mediaGardenField(garden),
  });
  const intent = attempt.intent!;
  if (intent.status === "pending") {
    const client = gardenBrowserClient();
    if (!client) throw new MediaError("media_unavailable");
    onStage?.("uploading");
    // A network failure can follow a completed immutable upload. Finalization
    // discovers whether the object arrived; retries never overwrite its bytes.
    try {
      await client.storage
        .from(mediaBuckets[garden].staging)
        .upload(intent.staging_path, file, {
          contentType: intent.mime_type,
          upsert: false,
        });
    } catch {
      /* finalize below */
    }
  }
  checkCurrent();
  onStage?.("checking");
  const result = await mediaRequest<{ status: string }>("finalize", {
    mediaId: intent.id,
    ...mediaGardenField(garden),
  });
  if (result.status !== "submitted") throw new MediaError("media_unavailable");
}

/** Photo errors that reject these exact bytes or this window: choose a photo again. */
export function photoRejected(code: string) {
  return (
    [
      "unsupported_photo",
      "invalid_photo",
      "type_mismatch",
      "photo_too_large",
      "photo_size_mismatch",
      "entry_rejected",
    ].includes(code) || code.startsWith("media_expired")
  );
}
/**
 * Why a voice save cannot be retried as is: the server refused these bytes
 * (record again), or the care or edit window changed; null for anything a
 * retry of the same memo may fix.
 */
export function voiceRejection(code: string): "bytes" | "window" | null {
  if (
    [
      "unsupported_audio",
      "invalid_audio",
      "audio_too_large",
      "type_mismatch",
      "photo_size_mismatch",
    ].includes(code)
  )
    return "bytes";
  if (code === "entry_rejected" || code.startsWith("media_expired"))
    return "window";
  return null;
}
export function voiceSaveMessage(error: unknown) {
  if (!(error instanceof MediaError))
    return "We could not confirm the save. Check today's entries, then retry this same memo when connected.";
  if (
    [
      "unsupported_audio",
      "invalid_audio",
      "audio_too_large",
      "type_mismatch",
      "photo_size_mismatch",
    ].includes(error.code)
  )
    return "This recording could not be accepted. Record a new WebM/Opus memo up to five minutes and 12 MiB. The server checks the whole recording; it is never shortened automatically.";
  if (error.code === "audio_unavailable")
    return "Voice processing is temporarily unavailable. Keep this memo and retry later.";
  if (error.code === "media_processing")
    return "Your memo may still be processing. Check today's entries and wait two minutes before retrying this same memo.";
  if (error.code === "upload_missing")
    return "The upload was interrupted. Keep this memo and retry when connected.";
  if (error.code === "entry_rejected" || error.code.startsWith("media_expired"))
    return "The care or edit window changed. Check today's entries; your previous saved memo is kept. Record again only if care is still available.";
  if (error.code === "media_upload_limit")
    return "Too many unfinished uploads. Wait for them to expire, then try again.";
  if (["signin_required", "media_not_available"].includes(error.code))
    return "Voice access could not be verified. Sign in again to your garden.";
  return "We could not confirm the memo save. Check today's entries before retrying this same memo.";
}
