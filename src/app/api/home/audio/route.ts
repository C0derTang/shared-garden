import { open, type FileHandle } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { createRequestClient, noStore } from "@/lib/auth/client";
import { getAuthConfig } from "@/lib/auth/config";
import { verifyMember } from "@/lib/auth/member";
import {
  HOME_MEDIA_KEYS, HomeMediaUnavailable, contentRange, discard, exactBody, fetchHomeObject, localMediaConfigured,
} from "@/lib/landing/home-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const audioTypes: Record<string, string> = {
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".wav": "audio/wav", ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
};
const maxBytes = 128 * 1024 * 1024;
const empty = (status: number) => noStore(new NextResponse(null, { status }));

/** A client can select a byte range, never a file path or remote URL. */
function byteRange(value: string, size: number): [number, number] | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!match[1]) return last > 0 ? [Math.max(0, size - last), size - 1] : null;
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && first <= end ? [first, end] : null;
}

/** Bounded reads avoid buffering the recording; cancellation closes its handle. */
function audioStream(file: FileHandle, start: number, end: number) {
  let position = start;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    await file.close().catch(() => {});
  }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (closed) return;
      try {
        const chunk = new Uint8Array(Math.min(64 * 1024, end - position + 1));
        const { bytesRead } = await file.read(chunk, 0, chunk.length, position);
        if (closed) return;
        if (!bytesRead) throw new Error("audio_unavailable");
        position += bytesRead;
        controller.enqueue(chunk.subarray(0, bytesRead));
        if (position > end) { await close(); controller.close(); }
      } catch {
        await close();
        // Never propagate a filesystem error or private path into the response.
        controller.error(new Error("audio_unavailable"));
      }
    },
    cancel: close,
  });
}

/** One private recording: its size, type and a bounded byte stream. */
type AudioSource = {
  size: number;
  contentType: string;
  stream(start: number, end: number, ranged: boolean): Promise<ReadableStream<Uint8Array>>;
  close(): Promise<void>;
};

async function localSource(): Promise<AudioSource | null> {
  const configured = process.env.SUNSET_AUDIO_PATH?.trim();
  if (!configured || !path.isAbsolute(configured)) return null;
  const publicRoot = path.resolve(process.cwd(), "public");
  const resolved = path.resolve(configured);
  if (resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`)) return null;
  const contentType = audioTypes[path.extname(configured).toLowerCase()];
  if (!contentType) return null;
  const file = await open(configured, "r");
  try {
    const info = await file.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size <= 0 || info.size > maxBytes) {
      await file.close().catch(() => {});
      return null;
    }
    return {
      size: info.size, contentType,
      stream: async (start, end) => audioStream(file, start, end),
      close: () => file.close().catch(() => {}),
    };
  } catch (error) {
    await file.close().catch(() => {});
    throw error;
  }
}

/**
 * Production copy in private storage. A one-byte probe learns the size so the
 * route keeps its own range semantics; each body is verified against the exact
 * bytes requested before any of it reaches the client.
 */
async function storageSource(signal: AbortSignal): Promise<AudioSource | null> {
  const probe = await fetchHomeObject(HOME_MEDIA_KEYS.audio, { range: "bytes=0-0", signal });
  await discard(probe);
  const probed = probe.status === 206 ? contentRange(probe.headers.get("content-range")) : null;
  if (!probed || probed.start !== 0 || probed.end !== 0 || probed.size <= 0 || probed.size > maxBytes) return null;
  const size = probed.size;
  return {
    size, contentType: "audio/mpeg",
    async stream(start, end, ranged) {
      const whole = !ranged && start === 0 && end === size - 1;
      const response = await fetchHomeObject(HOME_MEDIA_KEYS.audio, whole ? { signal } : { range: `bytes=${start}-${end}`, signal });
      const length = end - start + 1;
      const actual = whole ? null : contentRange(response.headers.get("content-range"));
      const matches = whole
        ? response.status === 200 && Number(response.headers.get("content-length") ?? length) === length
        : response.status === 206 && actual?.start === start && actual.end === end && actual.size === size;
      if (!matches || !response.body) {
        await discard(response);
        throw new HomeMediaUnavailable();
      }
      return exactBody(response.body, length);
    },
    close: async () => {},
  };
}

async function audioResponse(request: NextRequest, head: boolean): Promise<NextResponse> {
  const source = localMediaConfigured("SUNSET_AUDIO_PATH") ? await localSource() : await storageSource(request.signal);
  if (!source) return empty(503);
  let streaming = false;
  try {
    const { size } = source;
    const headers = new Headers({
      "Content-Type": source.contentType, "Accept-Ranges": "bytes",
      "Content-Length": String(size), "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    // No validators are advertised. An If-Range cannot match, so send the full
    // representation; Range otherwise applies to GET, never HEAD.
    const range = head || request.headers.has("if-range") ? null : request.headers.get("range");
    const bounds = range ? byteRange(range, size) : [0, size - 1];
    if (!bounds) return new NextResponse(null, {
      status: 416, headers: { "Content-Range": `bytes */${size}` },
    });
    const [start, end] = bounds;
    if (range) {
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
    }
    if (head) return new NextResponse(null, { status: 200, headers });
    const body = await source.stream(start, end, Boolean(range));
    streaming = true;
    return new NextResponse(body, { status: range ? 206 : 200, headers });
  } finally {
    if (!streaming) await source.close();
  }
}

async function serve(request: NextRequest, head: boolean) {
  const config = getAuthConfig();
  if (!config) return empty(503);
  let auth: ReturnType<typeof createRequestClient> | undefined;
  try {
    auth = createRequestClient(request, config);
    const access = await verifyMember(auth.client);
    if (access.status !== "allowed") return auth.finish(empty(
      access.status === "signin" ? 401 : access.status === "denied" ? 403 : 503,
    ));
    return auth.finish(await audioResponse(request, head));
  } catch {
    return auth ? auth.finish(empty(503)) : empty(503);
  }
}

export function GET(request: NextRequest) { return serve(request, false); }
export function HEAD(request: NextRequest) { return serve(request, true); }
