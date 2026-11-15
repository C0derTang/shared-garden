import { describe, expect, it } from "vitest";
import { charOpacities, exitFade, lyricFrame, parseLyrics, sameLyricFrame, type LyricCue } from "./lyrics";

const cues = [
  { start: 1, end: 3, text: "Synthetic dawn" },
  { start: 5, end: 7, text: "Synthetic evening" },
];

it("keeps only validated cue fields, preserving deliberate gaps", () => {
  expect(parseLyrics({ version: 1, privateMetadata: "not returned", cues })).toEqual({ version: 1, cues });
  expect(parseLyrics({ version: 1, cues: [{ ...cues[0], note: "private" }] })).toEqual({ version: 1, cues: [cues[0]] });
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

describe("charOpacities", () => {
  const timed: LyricCue = { start: 10, end: 12, text: "abcd", chars: [10, 10.5, 10.52, 11.5] };

  it("ramps each character linearly from its own onset over at most 120 ms", () => {
    expect(charOpacities(timed, 9.9)).toEqual([0, 0, 0, 0]);
    expect(charOpacities(timed, 10.06)).toEqual([0.5, 0, 0, 0]);
    expect(charOpacities(timed, 10.12)).toEqual([1, 0, 0, 0]);
    // A held first note does not delay the second character.
    expect(charOpacities(timed, 10.56)).toEqual([1, 1, 0.33, 0]);
  });

  it("shortens a ramp to the next onset with a 40 ms floor", () => {
    expect(charOpacities(timed, 10.52)).toEqual([1, 0.5, 0, 0]);
    expect(charOpacities(timed, 10.54)).toEqual([1, 1, 0.17, 0]);
    expect(charOpacities(timed, 11.62)).toEqual([1, 1, 1, 1]);
  });

  it("falls back to a constant-velocity sweep across the cue without onsets", () => {
    const plain = { start: 10, end: 14, text: "abcd" };
    expect(charOpacities(plain, 10)).toEqual([0, 0, 0, 0]);
    expect(charOpacities(plain, 10.5)).toEqual([0.5, 0, 0, 0]);
    expect(charOpacities(plain, 12.75)).toEqual([1, 1, 0.75, 0]);
    expect(charOpacities(plain, 20)).toEqual([1, 1, 1, 1]);
  });
});

describe("exitFade", () => {
  const at = (end: number, nextStart?: number) => {
    const fade = exitFade({ start: 0, end, text: "a" }, nextStart === undefined ? undefined : { start: nextStart, end: nextStart + 1, text: "b" });
    return [fade.start, fade.end, fade.duration].map((value) => +value.toFixed(3));
  };

  it("keeps a 250 ms linger and 500 ms fade for the last phrase and long gaps", () => {
    expect(at(10)).toEqual([10.25, 10.75, 0.5]);
    expect(at(10, 12)).toEqual([10.25, 10.75, 0.5]);
    expect(at(10, 10.75)).toEqual([10.25, 10.75, 0.5]);
  });

  it("shortens the linger, then the fade, so the fade always ends by the next start", () => {
    expect(at(10, 10.6)).toEqual([10.24, 10.6, 0.36]);
    expect(at(10, 10.17)).toEqual([10.068, 10.17, 0.102]);
    expect(at(10, 10.05)).toEqual([10.02, 10.05, 0.03]);
  });

  it("removes the phrase at the next start without a fade when the phrases touch", () => {
    expect(at(10, 10)).toEqual([10, 10, 0]);
    expect(at(10, 10.03)).toEqual([10.03, 10.03, 0]);
  });
});

describe("lyricFrame", () => {
  const song: LyricCue[] = [
    { start: 10, end: 12, text: "ab", chars: [10, 11] },
    { start: 12.02, end: 13, text: "cd", chars: [12.02, 12.5] },
    { start: 22, end: 23, text: "ef" },
  ];
  const at = (time: number) => lyricFrame(song, time);

  it("shows the phrase from its start and fades it in place, linearly, after the brief linger", () => {
    expect(at(10.06)).toEqual({ phrases: [{ index: 0, opacity: 1, chars: [0.5, 0] }], resume: null });
    expect(at(13.25).phrases).toEqual([{ index: 1, opacity: 1, chars: [1, 1] }]);
    expect(at(13.5).phrases).toEqual([{ index: 1, opacity: 0.5, chars: [1, 1] }]);
    expect(at(13.75)).toEqual({ phrases: [], resume: null });
  });

  it("never overlaps phrases: a touching phrase is removed when the next one starts", () => {
    expect(at(12.01).phrases).toEqual([{ index: 0, opacity: 1, chars: [1, 1] }]);
    expect(at(12.02).phrases.map(({ index }) => index)).toEqual([1]);
  });

  it("shows resume dots only before long gaps, lighting one per second over the final three", () => {
    expect([15, 15.9, 16.1, 18.9, 19, 20, 21, 21.9].map((time) => at(time).resume)).toEqual([null, null, 0, 0, 1, 2, 3, 3]);
    expect([0, 3.9, 4, 7, 9].map((time) => at(time).resume)).toEqual([null, null, 0, 1, 3]);
    expect(lyricFrame([{ start: 4, end: 5, text: "a" }], 2).resume).toBeNull();
  });

  it("clears after the final fade and for invalid times", () => {
    expect(at(23.8)).toEqual({ phrases: [], resume: null });
    expect(at(NaN)).toEqual({ phrases: [], resume: null });
    expect(lyricFrame([], 5)).toEqual({ phrases: [], resume: null });
  });

  it("compares frames by value so unchanged frames skip rendering", () => {
    expect(sameLyricFrame(at(11.5), at(11.6))).toBe(true);
    expect(sameLyricFrame(at(10.05), at(10.06))).toBe(false);
    expect(sameLyricFrame(null, null)).toBe(true);
    expect(sameLyricFrame(null, at(10))).toBe(false);
  });
});
