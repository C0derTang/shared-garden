import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import {
  searchInput,
  searchSpotify,
  SpotifySearchError,
} from "@/lib/music/spotify-search";
export const runtime = "nodejs";
function json(body: unknown, status = 200, retryAfter?: number) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
    },
  });
}
export async function GET(request: Request) {
  try {
    await requireMember({ unavailable: "throw" });
  } catch (error) {
    // API consumers always receive a bounded JSON error, including auth redirects.
    return json(
      { error: "unavailable" },
      error instanceof MemberAccessUnavailableError ? 503 : 401,
    );
  }
  try {
    const { q, page } = searchInput(new URL(request.url).searchParams);
    return json(await searchSpotify(q, page, request.signal));
  } catch (error) {
    if (error instanceof SpotifySearchError)
      return json(
        {
          error: error.code,
          ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
        },
        error.code === "invalid"
          ? 400
          : error.code === "rate_limited"
            ? 429
            : 503,
        error.retryAfter,
      );
    return json({ error: "unavailable" }, 503);
  }
}
