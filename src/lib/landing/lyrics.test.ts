import { describe, expect, it } from "vitest";
import { advanceLyricView, charOnsets, lyricFrame, parseLyrics, type LyricCue } from "./lyrics";

const cues = [
  { start: 1, end: 3, text: "Synthetic dawn" },
  { start: 5, end: 7, text: "Synthetic evening" },
];

it("keeps only validated cue fields, preserving deliberate gaps", () => {
  expect(parseLyrics({ version: 1, privateMetadata: "not returned", cues })).toEqual({ version: 1, cues });
});

it("accepts optional per-character onsets, one per code point, and copies them", () => {
  const timed = [{ start: 1, end: 2, text: " 晨光 ", chars: [1, 1.4] }, { start: 2, end: 3, text: "ab", chars: [2, 2] }];
  const parsed = parseLyrics({ version: 1, cues: timed });
  expect(parsed).toEqual({ version: 1, cues: [{ start: 1, end: 2, text: "晨光", chars: [1, 1.4] }, timed[1]] });
  expect(parsed!.cues[0].chars).not.toBe(timed[0].chars);
});

it.each([null, {}, { version: 2, cues }, { version: 1, cues: [{ start: 3, end: 1, text: "test" }] },
  { version: 1, cues: [{ start: -1, end: 1, text: "test" }] },
  { version: 1, cues: [{ start: 1, end: Infinity, text: "test" }] },
  { version: 1, cues: [{ start: 1, end: 2, text: " " }] },
  { version: 1, cues: [{ start: 1, end: 2, text: "x".repeat(501) }] },
  { version: 1, cues: [cues[1], cues[0]] },
  { version: 1, cues: [cues[0], { start: 2, end: 4, text: "overlap" }] },
])("rejects invalid, unbounded or overlapping cue data", (value) => {
  expect(parseLyrics(value)).toBeNull();
});

it.each([
  ["a non-array", "1"], ["too few onsets", [1]], ["too many onsets", [1, 1.2, 1.4]],
  ["a non-finite onset", [1, NaN]], ["a string onset", [1, "1.5"]], ["decreasing onsets", [1.5, 1.2]],
  ["an onset before the cue", [0.9, 1.2]], ["an onset at the cue end", [1, 2]],
])("rejects the whole file for %s", (_, chars) => {
  expect(parseLyrics({ version: 1, cues: [{ start: 1, end: 2, text: "ab", chars }] })).toBeNull();
});

it("spreads cues without onsets evenly across the first 80% of the phrase", () => {
  expect(charOnsets({ start: 10, end: 15, text: "abcd" })).toEqual([10, 11, 12, 13]);
  expect(charOnsets({ start: 10, end: 15, text: "ab", chars: [10, 14] })).toEqual([10, 14]);
});

describe("lyricFrame", () => {
  const song: LyricCue[] = [
    { start: 10, end: 12, text: "abc", chars: [10, 10.5, 11] },
    { start: 13, end: 14, text: "de", chars: [13, 13.5] },
    { start: 22, end: 23, text: "fg", chars: [22, 22.4] },
  ];
  const at = (time: number) => lyricFrame(song, time);

  it("reveals characters at their onsets and holds the phrase across short gaps", () => {
    expect([10, 10.49, 10.5, 11.2, 12.5, 13].map((time) => [at(time).index, at(time).revealed]))
      .toEqual([[0, 1], [0, 1], [0, 2], [0, 3], [0, 3], [1, 1]]);
  });

  it("lingers briefly before a long gap, then clears", () => {
    expect(at(14.7).index).toBe(1);
    expect(at(14.8)).toEqual({ index: -1, revealed: 0, resume: null });
  });

  it("shows resume dots only before long gaps, lighting one per second over the final three", () => {
    expect([15, 15.9, 16.1, 18.9, 19, 20, 21, 21.9].map((time) => at(time).resume)).toEqual([null, null, 0, 0, 1, 2, 3, 3]);
    expect([0, 3.9, 4, 7, 9].map((time) => at(time).resume)).toEqual([null, null, 0, 1, 3]);
    expect(lyricFrame([{ start: 4, end: 5, text: "a" }], 2).resume).toBeNull();
  });

  it("clears after the final phrase and for invalid times", () => {
    expect(at(23.8).index).toBe(-1);
    expect(at(30).resume).toBeNull();
    expect(at(NaN)).toEqual({ index: -1, revealed: 0, resume: null });
    expect(lyricFrame([], 5)).toEqual({ index: -1, revealed: 0, resume: null });
  });
});

describe("advanceLyricView", () => {
  const song: LyricCue[] = [
    { start: 1, end: 2, text: "ab", chars: [1, 1.5] },
    { start: 2.2, end: 3, text: "cd", chars: [2.2, 2.6] },
  ];

  it("animates characters crossed during continuous playback", () => {
    let view = advanceLyricView(null, song, 0.9);
    view = advanceLyricView(view, song, 1.05);
    expect(view).toMatchObject({ index: 0, revealed: 1, settled: 0, leaving: null });
    view = advanceLyricView(view, song, 1.55);
    expect(view).toMatchObject({ revealed: 2, settled: 0 });
  });

  it("settles everything already sung after a seek or first load", () => {
    expect(advanceLyricView(null, song, 1.6)).toMatchObject({ index: 0, revealed: 2, settled: 2 });
    const before = advanceLyricView(advanceLyricView(null, song, 1), song, 1.1);
    expect(advanceLyricView(before, song, 2.7)).toMatchObject({ index: 1, revealed: 2, settled: 2, leaving: null });
    expect(advanceLyricView(before, song, 0.5)).toMatchObject({ index: -1, leaving: null });
  });

  it("sends the previous phrase away when the next begins and keeps a single leaving phrase", () => {
    let view = advanceLyricView(null, song, 1.9);
    view = advanceLyricView(view, song, 2.21);
    expect(view).toMatchObject({ index: 1, revealed: 1, settled: 0, leaving: { index: 0, revealed: 2 } });
    const leaving = view.leaving;
    view = advanceLyricView(view, song, 2.4);
    expect(view.leaving).toBe(leaving);
  });
});
