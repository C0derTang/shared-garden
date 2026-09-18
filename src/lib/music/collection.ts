import { parseEntries, type Entry } from "@/lib/garden/model";

export const SONG_PAGE_SIZE = 20;
export type SongQuery =
  | { kind: "latest" }
  | { kind: "older" | "newer"; id: number }
  | { kind: "updates"; ids: number[] };
export type SongPage = {
  entries: Entry[];
  more: boolean;
  error: string | null;
};
const positiveId = (id: unknown): id is number =>
  typeof id === "number" && Number.isSafeInteger(id) && id > 0;
export function validSongQuery(value: unknown): value is SongQuery {
  if (!value || typeof value !== "object") return false;
  const query = value as Record<string, unknown>;
  if (query.kind === "latest") return true;
  if (query.kind === "older" || query.kind === "newer")
    return positiveId(query.id);
  return (
    query.kind === "updates" &&
    Array.isArray(query.ids) &&
    query.ids.length > 0 &&
    query.ids.length <= SONG_PAGE_SIZE &&
    query.ids.every(positiveId)
  );
}
export function parseSongs(value: unknown): Entry[] {
  const entries = parseEntries(value);
  for (const entry of entries) {
    if (
      !["title", "artist", "url"].every(
        (key) => typeof entry.payload[key] === "string",
      )
    )
      throw new Error("Invalid song response");
  }
  return entries;
}
/** Identity is the contribution ID, never the song URL or metadata. */
export function mergeSongs(existing: Entry[], incoming: Entry[]): Entry[] {
  const rows = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) rows.set(entry.id, entry);
  return [...rows.values()].sort((a, b) => b.id - a.id);
}
