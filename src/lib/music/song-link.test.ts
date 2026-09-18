import { describe, expect, it } from "vitest";
import { parseSongLink } from "./song-link";

const trackId = "0Lr4kGOYn9l83EjuK6cZFQ";
const trackUrl = `https://open.spotify.com/track/${trackId}`;

describe("song links", () => {
  it.each([trackUrl, `${trackUrl}?si=shared&autoplay=1#saved`, `https://OPEN.SPOTIFY.COM/track/${trackId}`])(
    "derives a query-free official embed while preserving %s",
    (originalUrl) => {
      expect(parseSongLink(originalUrl)).toEqual({
        kind: "spotify",
        originalUrl,
        trackId,
        embedUrl: "https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ",
      });
    },
  );

  it.each([
    "https://music.example.com/song?version=live#chorus",
    "https://xn--bcher-kva.example/song",
    "https://music.example.com:65535/歌?name=caf%C3%A9",
    `https://open.spotify.com.evil.example/track/${trackId}`,
    `https://spotify.com/track/${trackId}`,
    `https://open.spotify.com:443/track/${trackId}`,
    `https://open.spotify.com/album/${trackId}`,
    `https://open.spotify.com/embed/track/${trackId}`,
    `https://open.spotify.com/intl-en/track/${trackId}`,
    `https://open.spotify.com/track/${trackId}/`,
    `https://open.spotify.com/track/${trackId}/extra`,
    `https://open.spotify.com/track/${trackId.slice(1)}`,
    `https://open.spotify.com/track/${trackId}x`,
    `https://open.spotify.com/track/${trackId.slice(1)}_`,
    `https://open.spotify.com/track/%30Lr4kGOYn9l83EjuK6cZFQ`,
    `https://open.spotify.com/a/../track/${trackId}`,
    `https://open.spotify.com/TRACK/${trackId}`,
  ])("retains safe unsupported URLs only as original links: %s", (originalUrl) => {
    expect(parseSongLink(originalUrl)).toEqual({ kind: "external", originalUrl });
  });

  it.each([
    "", "not a URL", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>",
    trackUrl.replace("https:", "http:"), `spotify:track:${trackId}`,
    trackUrl.replace("https:", ""), `${trackUrl} `, ` ${trackUrl}`,
    `https://person@open.spotify.com/track/${trackId}`,
    `https://person:secret@open.spotify.com/track/${trackId}`,
    `https://open.spotify.com@evil.example/track/${trackId}`,
    `https://open.spotify.com\\@evil.example/track/${trackId}`,
    `https://open.spotify.com./track/${trackId}`,
    `https://open..spotify.com/track/${trackId}`,
    `https://-open.spotify.com/track/${trackId}`,
    `https://open.spotify.com:0/track/${trackId}`,
    `https://open.spotify.com:65536/track/${trackId}`,
    `https://open.spotify.com:000443/track/${trackId}`,
    `https://opеn.spotify.com/track/${trackId}`,
    `https://open%2espotify.com/track/${trackId}`,
    `https://localhost/track/${trackId}`,
    `https://127.0.0.1/track/${trackId}`,
    `https://${"a".repeat(64)}.example/song`,
    `https://${["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(63)].join(".")}/song`,
    `${trackUrl}?bad=%`, `${trackUrl}?bad=%xz`, `${trackUrl}?bad=%0A`, `${trackUrl}?bad=%1f`, `${trackUrl}?bad=%7F`,
    `${trackUrl}?bad=\n`, `${trackUrl}?bad=\u0000`, `${trackUrl}?bad=\u0085`,
    `<iframe src="${trackUrl}"></iframe>`,
  ])("fails closed for unsafe or malformed links: %s", (value) => {
    expect(parseSongLink(value)).toEqual({ kind: "invalid" });
  });

  it("enforces the entry contract's inclusive 512-character URL bound", () => {
    const prefix = "https://music.example.com/";
    const originalUrl = prefix + "a".repeat(512 - prefix.length);
    expect(parseSongLink(originalUrl)).toEqual({ kind: "external", originalUrl });
    expect(parseSongLink(originalUrl + "a")).toEqual({ kind: "invalid" });
    const unicodeUrl = prefix + "🌷".repeat(512 - prefix.length);
    expect(parseSongLink(unicodeUrl)).toEqual({ kind: "external", originalUrl: unicodeUrl });
  });
});
