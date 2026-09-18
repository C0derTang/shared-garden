import { expect, it } from "vitest";
import { entryFixture } from "@/test/garden-fixture";
import { mergeSongs, parseSongs, validSongQuery } from "./collection";
it("retains 42 contributions across three Tulips including repeated titles and links", () => {
  const rows = Array.from({ length: 42 }, (_, i) => ({
    ...entryFixture(),
    id: i + 1,
    flower_id: `tulip-${Math.floor(i / 14)}`,
    author_id: (i % 2) + 1,
    payload: {
      title: "Again",
      artist: "Artist",
      url: "https://example.com/song",
    },
  }));
  const songs = mergeSongs(
    parseSongs(rows.slice(20)),
    parseSongs(rows.slice(0, 20)),
  );
  expect(songs).toHaveLength(42);
  expect(songs.map((e) => e.id)).toEqual(
    Array.from({ length: 42 }, (_, i) => 42 - i),
  );
});
it("replaces the same contribution after an edit without dropping loaded history or changing its original date", () => {
  const row = {
    ...entryFixture(),
    payload: {
      title: "Before",
      artist: "Artist",
      url: "https://example.com/song",
    },
  };
  const edited = {
    ...row,
    updated_at: "2026-09-18T17:05:00Z",
    payload: { ...row.payload, title: "After" },
  };
  const result = mergeSongs(
    [row, { ...row, id: 2 }],
    [edited, { ...row, id: 3 }],
  );
  expect(result.map((e) => e.id)).toEqual([3, 2, 1]);
  expect(result[2].payload.title).toBe("After");
  expect(result[2].original_posted_at).toBe(row.original_posted_at);
});
it("rejects malformed song data and unbounded or unsafe client queries", () => {
  expect(() => parseSongs([entryFixture()])).toThrow();
  expect(validSongQuery({ kind: "older", id: 0 })).toBe(false);
  expect(validSongQuery({ kind: "newer", id: 1.5 })).toBe(false);
  expect(
    validSongQuery({
      kind: "updates",
      ids: Array.from({ length: 21 }, (_, i) => i + 1),
    }),
  ).toBe(false);
  expect(validSongQuery({ kind: "updates", ids: [1, 2] })).toBe(true);
  expect(validSongQuery({ kind: "latest" })).toBe(true);
});
