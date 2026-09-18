export type SongLink =
  | { kind: "invalid" }
  | { kind: "external"; originalUrl: string }
  | { kind: "spotify"; originalUrl: string; trackId: string; embedUrl: string };

// Match the saved Tulip URL contract before deriving any provider URL. Parsing
// the original path avoids URL normalization turning an unsupported path into
// an accepted track (for example /album/../track/...).
const safeHttpsUrl = /^https:\/\/((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?::([0-9]{1,5}))?([/?#].*)?$/u;

export function parseSongLink(value: string): SongLink {
  if (
    Array.from(value).length > 512 ||
    /[\s\p{Cc}\\]/u.test(value) ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value) ||
    /%(?![0-9a-f]{2})/i.test(value)
  ) {
    return { kind: "invalid" };
  }

  const match = safeHttpsUrl.exec(value);
  if (!match || match[1].length > 253) return { kind: "invalid" };
  const [, host, port, path = ""] = match;
  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    return { kind: "invalid" };
  }

  const track = /^\/track\/([A-Za-z0-9]{22})(?:[?#].*)?$/u.exec(path);
  if (host.toLowerCase() === "open.spotify.com" && !port && track) {
    return {
      kind: "spotify",
      originalUrl: value,
      trackId: track[1],
      embedUrl: `https://open.spotify.com/embed/track/${track[1]}`,
    };
  }

  return { kind: "external", originalUrl: value };
}
