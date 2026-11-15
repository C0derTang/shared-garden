import "server-only";
import { getAuthConfig } from "@/lib/auth/config";
import { getServerConfig } from "@/lib/config/server";

/**
 * Private production copies of the sunset home media. The bucket has no client
 * policies; only the server secret reads it, after the route's member check.
 * Keys are fixed so no client input can select another object.
 */
export const HOME_MEDIA_BUCKET = "home-media";
export const HOME_MEDIA_KEYS = {
  audio: "sunset/recording.mp3",
  lyrics: "sunset/lyrics.json",
} as const;
export type HomeMediaKey = (typeof HOME_MEDIA_KEYS)[keyof typeof HOME_MEDIA_KEYS];

const headerTimeoutMs = 15_000;

/** Generic failure: provider status, URLs and messages never leave this module. */
export class HomeMediaUnavailable extends Error {
  constructor() { super("home_media_unavailable"); }
}

/** True when an operator selected a local file, which takes precedence over storage. */
export function localMediaConfigured(name: "SUNSET_AUDIO_PATH" | "SUNSET_LYRICS_PATH") {
  return Boolean(process.env[name]?.trim());
}

/**
 * Requests one fixed private object with the server secret. The timeout covers
 * only the response headers; a streaming body stays tied to the caller's signal.
 */
export async function fetchHomeObject(
  key: HomeMediaKey,
  options: { range?: string; signal?: AbortSignal } = {},
): Promise<Response> {
  const auth = getAuthConfig();
  const server = getServerConfig();
  if (!auth?.supabaseUrl || server.status !== "ready") throw new HomeMediaUnavailable();
  let url: URL;
  try {
    url = new URL(`/storage/v1/object/authenticated/${HOME_MEDIA_BUCKET}/${key}`, auth.supabaseUrl);
  } catch {
    throw new HomeMediaUnavailable();
  }
  const secret = server.config.supabaseSecretKey;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), headerTimeoutMs);
  const abort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    return await fetch(url, {
      method: "GET",
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        ...(options.range ? { Range: options.range } : {}),
      },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
  } catch {
    options.signal?.removeEventListener("abort", abort);
    throw new HomeMediaUnavailable();
  } finally {
    clearTimeout(timer);
  }
}

/** Parses `bytes a-b/size` exactly as requested; anything else is unusable. */
export function contentRange(value: string | null) {
  const match = value ? /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value) : null;
  if (!match) return null;
  const [start, end, size] = match.slice(1).map(Number);
  if (![start, end, size].every(Number.isSafeInteger) || start > end || end >= size) return null;
  return { start, end, size };
}

/** Releases an unused upstream body without surfacing its errors. */
export async function discard(response: Response) {
  await response.body?.cancel().catch(() => {});
}

/**
 * Re-emits exactly `length` upstream bytes. A short, long or failed upstream
 * body errors the stream generically; cancellation releases the upstream body.
 */
export function exactBody(body: ReadableStream<Uint8Array>, length: number) {
  const reader = body.getReader();
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (sent !== length) throw new HomeMediaUnavailable();
          controller.close();
          return;
        }
        sent += value.byteLength;
        if (sent > length) throw new HomeMediaUnavailable();
        controller.enqueue(value);
      } catch {
        await reader.cancel().catch(() => {});
        controller.error(new HomeMediaUnavailable());
      }
    },
    async cancel() { await reader.cancel().catch(() => {}); },
  });
}

/** Reads at most `limit` bytes; larger or failed bodies are rejected. */
export async function boundedBytes(response: Response, limit: number) {
  const declared = response.headers.get("content-length");
  if (declared !== null && !(Number(declared) <= limit)) {
    await discard(response);
    throw new HomeMediaUnavailable();
  }
  if (!response.body) throw new HomeMediaUnavailable();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new HomeMediaUnavailable();
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw new HomeMediaUnavailable();
  }
  return Buffer.concat(chunks, length);
}
