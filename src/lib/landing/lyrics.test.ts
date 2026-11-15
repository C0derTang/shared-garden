import { expect, it } from "vitest";
import { parseLyrics, lyricAt } from "./lyrics";

const cues = [
  { start: 1, end: 3, text: "Synthetic dawn" },
  { start: 5, end: 7, text: "Synthetic evening" },
];

it("keeps only validated cue fields, preserving deliberate gaps", () => {
  expect(parseLyrics({ version: 1, privateMetadata: "not returned", cues })).toEqual({ version: 1, cues });
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

it("selects half-open cue intervals and clears instrumental gaps and ending", () => {
  expect([0, 1, 2.9, 3, 4, 5, 7, NaN].map((time) => lyricAt(cues, time)?.text ?? null))
    .toEqual([null, "Synthetic dawn", "Synthetic dawn", null, null, "Synthetic evening", null, null]);
});
