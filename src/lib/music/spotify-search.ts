import "server-only";
import type { SpotifyPage, SpotifyTrack } from "./spotify-types";

export class SpotifySearchError extends Error {
  constructor(
    public code:
      "invalid" | "unconfigured" | "access" | "rate_limited" | "unavailable",
    public retryAfter?: number,
  ) {
    super(code);
  }
}
let cachedToken: { value: string; expires: number } | null = null;
let retryAt = 0;
const unavailable = () => new SpotifySearchError("unavailable");
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw unavailable();
  return value as Record<string, unknown>;
};
const hasControls = (value: string) =>
  Array.from(value).some(
    (char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127,
  );
const metadata = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    Array.from(value).length > 2000 ||
    hasControls(value)
  )
    throw unavailable();
  return value;
};

export function searchInput(params: URLSearchParams) {
  const q = params.get("q")?.trim() ?? "";
  const page = params.get("page") ?? "0";
  if (
    [...params.keys()].some((key) => !["q", "page"].includes(key)) ||
    params.getAll("q").length !== 1 ||
    params.getAll("page").length > 1 ||
    Array.from(q).length < 2 ||
    Array.from(q).length > 100 ||
    hasControls(q) ||
    !/^[0-4]$/.test(page)
  )
    throw new SpotifySearchError("invalid");
  return { q, page: Number(page) };
}

// Bound the response body as well as the request lifetime. Never echo provider bodies.
async function json(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 131072) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
function checkStatus(response: Response) {
  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const seconds = header && /^\d{1,6}$/.test(header) ? Number(header) : 60;
    // A missing/invalid Retry-After is a conservative local cooldown, not a provider promise.
    const retryAfter = Math.max(1, Math.min(seconds, 86400));
    retryAt = Date.now() + retryAfter * 1000;
    throw new SpotifySearchError("rate_limited", retryAfter);
  }
  if (response.status === 403) throw new SpotifySearchError("access");
  if (!response.ok) throw unavailable();
}
async function token(signal: AbortSignal, clientId: string, secret: string) {
  if (cachedToken && cachedToken.expires > Date.now()) return cachedToken.value;
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    redirect: "error",
    cache: "no-store",
    signal,
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  checkStatus(response);
  const body = object(await json(response));
  if (
    typeof body.access_token !== "string" ||
    !/^[\x21-\x7e]{1,4096}$/.test(body.access_token) ||
    body.token_type !== "Bearer" ||
    typeof body.expires_in !== "number" ||
    !Number.isInteger(body.expires_in) ||
    body.expires_in < 60 ||
    body.expires_in > 86400
  )
    throw unavailable();
  cachedToken = {
    value: body.access_token,
    expires: Date.now() + (body.expires_in - 30) * 1000,
  };
  return cachedToken.value;
}
function normalize(value: unknown): SpotifyTrack {
  const item = object(value);
  if (typeof item.id !== "string" || !/^[A-Za-z0-9]{22}$/.test(item.id))
    throw unavailable();
  const title = metadata(item.name);
  if (
    !Array.isArray(item.artists) ||
    item.artists.length < 1 ||
    item.artists.length > 100
  )
    throw unavailable();
  const artist = item.artists
    .map((value) => metadata(object(value).name))
    .join(", ");
  if (Array.from(artist).length > 2000) throw unavailable();
  const album = object(item.album);
  const albumName = metadata(album.name);
  if (!Array.isArray(album.images) || album.images.length > 10)
    throw unavailable();
  // Remote navigation URLs are ignored; only canonical track IDs and exact image CDN paths survive.
  const image = album.images
    .map((value) => object(value).url)
    .find(
      (url) =>
        typeof url === "string" &&
        /^https:\/\/i\.scdn\.co\/image\/[a-f0-9]{40}$/.test(url),
    );
  return {
    id: item.id,
    title,
    artist,
    album: albumName,
    url: `https://open.spotify.com/track/${item.id}`,
    image: typeof image === "string" ? image : null,
    selectable:
      Array.from(title.trim()).length <= 200 &&
      Array.from(artist.trim()).length <= 200,
  };
}

export async function searchSpotify(
  q: string,
  page: number,
  clientSignal: AbortSignal,
): Promise<SpotifyPage> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const secret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !secret) throw new SpotifySearchError("unconfigured");
  if (retryAt > Date.now())
    throw new SpotifySearchError(
      "rate_limited",
      Math.ceil((retryAt - Date.now()) / 1000),
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  clientSignal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 8000);
  try {
    if (clientSignal.aborted) throw unavailable();
    const url = new URL("https://api.spotify.com/v1/search");
    url.search = new URLSearchParams({
      q,
      type: "track",
      market: "US",
      limit: "10",
      offset: String(page * 10),
    }).toString();
    for (let attempt = 0; attempt < 2; attempt++) {
      const accessToken = await token(controller.signal, clientId, secret);
      const response = await fetch(url.toString(), {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.status === 401) {
        if (cachedToken?.value === accessToken) cachedToken = null;
        await response.body?.cancel();
        if (attempt === 0) continue;
      }
      checkStatus(response);
      const body = object(object(await json(response)).tracks);
      if (
        !Array.isArray(body.items) ||
        body.items.length > 10 ||
        !Number.isSafeInteger(body.total) ||
        (body.total as number) < 0
      )
        throw unavailable();
      const tracks = body.items.map(normalize);
      return {
        tracks,
        more:
          page < 4 &&
          tracks.length === 10 &&
          (page + 1) * 10 < (body.total as number),
      };
    }
    throw unavailable();
  } catch (error) {
    if (error instanceof SpotifySearchError) throw error;
    throw unavailable();
  } finally {
    controller.abort();
    clearTimeout(timeout);
    clientSignal.removeEventListener("abort", abort);
  }
}
