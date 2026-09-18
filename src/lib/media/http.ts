import "server-only";
import { getAuthConfig } from "@/lib/auth/config";
import { MediaError } from "./image";

export async function readMediaRequest(
  request: Request,
): Promise<Record<string, unknown>> {
  const config = getAuthConfig();
  if (!config) throw new MediaError("media_unavailable", 503);
  if (request.headers.get("origin") !== config.appOrigin)
    throw new MediaError("invalid_origin", 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new MediaError("invalid_request", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new MediaError("invalid_request", 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new MediaError("invalid_request", 413);
      }
      parts.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new MediaError("invalid_request", 400);
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("invalid_request", 400);
  } finally {
    reader.releaseLock();
  }
}
export function exactFields(body: Record<string, unknown>, fields: string[]) {
  if (Object.keys(body).some((key) => !fields.includes(key)))
    throw new MediaError("invalid_request", 400);
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      value,
    )
  )
    throw new MediaError("invalid_request", 400);
  return value;
}
export function mediaJson(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export function mediaFailure(error: unknown) {
  if (error instanceof MediaError)
    return mediaJson(
      {
        error: error.code,
        ...(error.code === "media_processing" ? { retryAfter: 120 } : {}),
      },
      error.status,
    );
  return mediaJson({ error: "media_unavailable" }, 503);
}
export function checkRpc(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.message === "media_processing")
    throw new MediaError("media_processing", 409);
  if (error.code === "42501") throw new MediaError("media_not_available", 403);
  if (error.code === "22023") {
    const code = /^media_[a-z_]+$/.test(error.message)
      ? error.message
      : "entry_rejected";
    throw new MediaError(code, 409);
  }
  throw new MediaError("media_unavailable", 503);
}
