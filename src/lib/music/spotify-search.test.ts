// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { guard } = vi.hoisted(() => ({ guard: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireMember: guard }));
const id = "1234567890123456789012";
const track = {
  id,
  name: "Song",
  artists: [{ name: "Artist" }],
  album: {
    name: "Album",
    images: [{ url: `https://i.scdn.co/image/${"a".repeat(40)}` }],
  },
};
const token = () =>
  Response.json({
    access_token: "PRIVATE_TOKEN",
    token_type: "Bearer",
    expires_in: 3600,
  });
const result = (item = track, total = 1) =>
  Response.json({ tracks: { items: [item], total } });
let fetcher: ReturnType<typeof vi.fn>;
let GET: typeof import("@/app/api/music/search/route").GET;
beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "PRIVATE_ID");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "PRIVATE_SECRET");
  guard.mockReset().mockResolvedValue({ member: { member_id: 1 } });
  fetcher = vi
    .fn()
    .mockResolvedValueOnce(token())
    .mockImplementation(async () => result());
  vi.stubGlobal("fetch", fetcher);
  GET = (await import("@/app/api/music/search/route")).GET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
const request = (query = "q=song&page=0", signal?: AbortSignal) =>
  GET(new Request(`http://localhost/api/music/search?${query}`, { signal }));
it("checks membership before any provider request even for invalid inputs", async () => {
  guard.mockRejectedValue(new Error("PRIVATE_DENIAL"));
  const response = await request("q=x");
  expect(response.status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
  expect(await response.text()).not.toContain("PRIVATE");
});
it.each([
  "q=x",
  `q=${"a".repeat(101)}`,
  "q=song&page=-1",
  "q=song&page=5",
  "q=song&page=0.5",
  "q=song&page=1e0",
  "q=song&url=https://evil.test",
  "q=song&q=other",
  "q=%00bad",
])("rejects bounded input %s without upstream", async (query) => {
  expect((await request(query)).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});
it("uses only fixed upstream endpoints, US market, ten tracks and normalized URLs", async () => {
  const response = await request("q=Song%20Artist&page=2");
  const body = await response.json();
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(fetcher.mock.calls[0][0]).toBe(
    "https://accounts.spotify.com/api/token",
  );
  const url = new URL(String(fetcher.mock.calls[1][0]));
  expect(url.origin + url.pathname).toBe("https://api.spotify.com/v1/search");
  expect(Object.fromEntries(url.searchParams)).toEqual({
    q: "Song Artist",
    type: "track",
    market: "US",
    limit: "10",
    offset: "20",
  });
  expect(body.tracks[0]).toEqual({
    id,
    title: "Song",
    artist: "Artist",
    album: "Album",
    url: `https://open.spotify.com/track/${id}`,
    image: track.album.images[0].url,
    selectable: true,
  });
  expect(JSON.stringify(body)).not.toContain("PRIVATE");
  expect(
    fetcher.mock.calls.every(
      ([, init]) =>
        init.cache === "no-store" &&
        init.redirect === "error" &&
        init.signal instanceof AbortSignal,
    ),
  ).toBe(true);
});
it("reuses tokens until expiry and refreshes before expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  await request();
  await request();
  expect(fetcher).toHaveBeenCalledTimes(3);
  vi.setSystemTime(3700000);
  fetcher.mockResolvedValueOnce(token()).mockResolvedValueOnce(result());
  expect((await request()).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(5);
});
it("refreshes an unauthorized token once, never loops or leaks provider errors", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response("PRIVATE", { status: 401 }))
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response("PRIVATE", { status: 401 }));
  const response = await request();
  expect(response.status).toBe(503);
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(await response.text()).not.toContain("PRIVATE");
});
it("succeeds after one 401 refresh", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(result());
  expect((await request()).status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("handles missing credentials without a request", async () => {
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "");
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unconfigured" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("sanitizes provider access failures", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response("PRIVATE", { status: 403 }));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "access" });
});
it("honors Retry-After and suppresses more requests during the cooldown", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(
      new Response("PRIVATE", {
        status: 429,
        headers: { "Retry-After": "120" },
      }),
    );
  const response = await request();
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("120");
  expect(await response.json()).toEqual({
    error: "rate_limited",
    retryAfter: 120,
  });
  expect((await request()).status).toBe(429);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("does not follow provider URLs and drops untrusted artwork", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(
      result(
        {
          ...track,
          album: {
            name: "Album",
            images: [{ url: "https://i.scdn.co.evil.test/image/a" }],
          },
        },
        100,
      ),
    );
  const body = await (await request("q=song&page=4")).json();
  expect(body.tracks[0].image).toBeNull();
  expect(body.more).toBe(false);
});
it("retains full over-limit metadata with unavailable selection instead of truncation", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(result({ ...track, name: "🎵".repeat(201) }));
  const body = await (await request()).json();
  expect(body.tracks[0].title).toBe("🎵".repeat(201));
  expect(body.tracks[0].selectable).toBe(false);
});
it.each([
  { tracks: {} },
  { tracks: { items: [null], total: 1 } },
  { tracks: { items: [{ ...track, id: "../bad" }], total: 1 } },
  { tracks: { items: [], total: "1" } },
])("rejects malformed provider payloads without disclosure", async (data) => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(Response.json(data));
  const response = await request();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "unavailable" });
});
it("handles empty results", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(Response.json({ tracks: { items: [], total: 0 } }));
  expect(await (await request()).json()).toEqual({ tracks: [], more: false });
});
it("sanitizes network and malformed token errors", async () => {
  fetcher.mockReset().mockRejectedValueOnce(new Error("PRIVATE_SECRET"));
  expect(await (await request()).json()).toEqual({ error: "unavailable" });
  fetcher.mockResolvedValueOnce(
    Response.json({ access_token: "PRIVATE_TOKEN" }),
  );
  expect((await request()).status).toBe(503);
});
it("aborts upstream on client cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  expect((await request("q=song", controller.signal)).status).toBe(503);
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds stalled requests with a timeout", async () => {
  vi.useFakeTimers();
  fetcher
    .mockReset()
    .mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new Error("PRIVATE_TIMEOUT")),
          ),
        ),
    );
  const pending = request();
  await vi.advanceTimersByTimeAsync(8100);
  expect(await (await pending).json()).toEqual({ error: "unavailable" });
});
it("uses a local cooldown when Spotify omits Retry-After", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response("PRIVATE_QUOTA", { status: 429 }));
  expect(await (await request()).json()).toEqual({
    error: "rate_limited",
    retryAfter: 60,
  });
});
it("rejects oversized or invalid JSON provider bodies", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(new Response("x".repeat(131073)));
  expect((await request()).status).toBe(503);
  fetcher.mockResolvedValueOnce(new Response("PRIVATE not JSON"));
  expect(await (await request()).json()).toEqual({ error: "unavailable" });
});
it("computes bounded pagination from counts without following remote next links", async () => {
  fetcher
    .mockReset()
    .mockResolvedValueOnce(token())
    .mockResolvedValueOnce(
      Response.json({
        tracks: {
          items: Array.from({ length: 10 }, (_, i) => ({
            ...track,
            id: String(i).padStart(22, "0"),
          })),
          total: 1000,
          next: "https://evil.test",
        },
      }),
    );
  expect((await (await request()).json()).more).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("forwards client cancellation while a provider request is in flight", async () => {
  const controller = new AbortController();
  fetcher
    .mockReset()
    .mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        ),
    );
  const pending = request("q=song", controller.signal);
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  controller.abort();
  expect((await pending).status).toBe(503);
});

it.each(["bearer", "BEARER", "bEaReR"])(
  "accepts the documented case-insensitive token type %s",
  async (tokenType) => {
    fetcher
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "PRIVATE_TOKEN",
          token_type: tokenType,
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(result());
    const response = await request();
    expect(response.status).toBe(200);
    expect((await response.json()).tracks[0].title).toBe("Song");
  },
);
it.each(["Basic", "bearer ", "", null, 1, {}, ["bearer"]])(
  "rejects other or malformed token types %j",
  async (tokenType) => {
    fetcher
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "PRIVATE_TOKEN",
          token_type: tokenType,
          expires_in: 3600,
        }),
      );
    const response = await request();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);
