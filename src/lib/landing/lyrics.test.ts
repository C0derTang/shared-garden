import { describe, expect, it } from "vitest";
import { advanceLyricView, lyricFrame, parseLyrics, sweepOpacities, type LyricCue } from "./lyrics";

const cues = [
  { start: 1, end: 3, text: "Synthetic dawn" },
  { start: 5, end: 7, text: "Synthetic evening" },
];

it("keeps only validated cue fields, preserving deliberate gaps", () => {
  expect(parseLyrics({ version: 1, privateMetadata: "not returned", cues })).toEqual({ version: 1, cues });
});

it("drops unknown cue fields, including retired per-character timing", () => {
  expect(parseLyrics({ version: 1, cues: [{ ...cues[0], chars: [1, 2], note: "private" }] }))
    .toEqual({ version: 1, cues: [cues[0]] });
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

it("sweeps characters left to right at constant velocity with a one-character soft edge", () => {
  expect(sweepOpacities(4, 0)).toEqual([0, 0, 0, 0]);
  expect(sweepOpacities(4, 0.125)).toEqual([0.5, 0, 0, 0]);
  expect(sweepOpacities(4, 0.5)).toEqual([1, 1, 0, 0]);
  expect(sweepOpacities(4, 0.6875)).toEqual([1, 1, 0.75, 0]);
  expect(sweepOpacities(4, 1)).toEqual([1, 1, 1, 1]);
  expect(sweepOpacities(2, 7)).toEqual([1, 1]);
  // Equal time steps advance the sweep by equal amounts.
  const total = (progress: number) => sweepOpacities(10, progress).reduce((sum, value) => sum + value, 0);
  expect(total(0.3) - total(0.2)).toBeCloseTo(total(0.8) - total(0.7));
});

describe("lyricFrame", () => {
  const song: LyricCue[] = [
    { start: 10, end: 12, text: "abc" },
    { start: 13, end: 14, text: "de" },
    { start: 22, end: 23, text: "fg" },
  ];
  const at = (time: number) => lyricFrame(song, time);

  it("reports linear progress across the cue and holds the full phrase across short gaps", () => {
    expect([10, 10.5, 11, 11.9, 12.5, 13, 13.25].map((time) => [at(time).index, +at(time).progress.toFixed(6)]))
      .toEqual([[0, 0], [0, 0.25], [0, 0.5], [0, 0.95], [0, 1], [1, 0], [1, 0.25]]);
  });

  it("lingers briefly before a long gap, then clears", () => {
    expect(at(14.7)).toEqual({ index: 1, progress: 1, resume: null });
    expect(at(14.8)).toEqual({ index: -1, progress: 0, resume: null });
  });

  it("shows resume dots only before long gaps, lighting one per second over the final three", () => {
    expect([15, 15.9, 16.1, 18.9, 19, 20, 21, 21.9].map((time) => at(time).resume)).toEqual([null, null, 0, 0, 1, 2, 3, 3]);
    expect([0, 3.9, 4, 7, 9].map((time) => at(time).resume)).toEqual([null, null, 0, 1, 3]);
    expect(lyricFrame([{ start: 4, end: 5, text: "a" }], 2).resume).toBeNull();
  });

  it("clears after the final phrase and for invalid times", () => {
    expect(at(23.8).index).toBe(-1);
    expect(at(30).resume).toBeNull();
    expect(at(NaN)).toEqual({ index: -1, progress: 0, resume: null });
    expect(lyricFrame([], 5)).toEqual({ index: -1, progress: 0, resume: null });
  });
});

describe("advanceLyricView", () => {
  const song: LyricCue[] = [{ start: 1, end: 2, text: "ab" }, { start: 2.2, end: 3, text: "cd" }];

  it("applies seeks and first loads directly without a leaving phrase", () => {
    expect(advanceLyricView(null, song, 1.5)).toMatchObject({ index: 0, progress: 0.5, leaving: null });
    const before = advanceLyricView(advanceLyricView(null, song, 1.9), song, 1.95);
    expect(advanceLyricView(before, song, 2.6)).toMatchObject({ index: 1, progress: 0.5, leaving: null });
    expect(advanceLyricView(before, song, 0.5)).toMatchObject({ index: -1, leaving: null });
  });

  it("sends the previous phrase away when the next begins and keeps a single leaving phrase", () => {
    let view = advanceLyricView(null, song, 1.9);
    view = advanceLyricView(view, song, 2.2);
    expect(view).toMatchObject({ index: 1, progress: 0, leaving: { index: 0 } });
    const leaving = view.leaving;
    view = advanceLyricView(view, song, 2.4);
    expect(view.leaving).toBe(leaving);
  });
});
