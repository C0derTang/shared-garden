import { describe, expect, it } from "vitest";
import { blendMoodColors, moodBlend, moodColorOf, moodPick, toggleMood } from "./moods";

describe("shared Hydrangea moods", () => {
  it("toggles a main color, an accent and Other the way both gardens expect", () => {
    let draft: Record<string, string> = {};
    draft = toggleMood(draft, "calm");
    expect(draft).toEqual({ mood: "calm" });
    draft = toggleMood(draft, "tender");
    expect(draft).toEqual({ mood: "calm", mood2: "tender" });
    // A third color is ignored; removing the main color promotes the accent.
    expect(toggleMood(draft, "tense")).toBe(draft);
    expect(toggleMood(draft, "calm")).toEqual({ mood: "tender" });
    expect(toggleMood(draft, "tender")).toEqual({ mood: "calm" });
    // Other stands alone and keeps a note.
    expect(toggleMood({ mood: "calm", mood2: "low", note: "n" }, "other")).toEqual({ mood: "other", note: "n" });
    expect(toggleMood({ mood: "other" }, "other")).toEqual({});
    expect(toggleMood({ mood: "other" }, "joyful")).toEqual({ mood: "joyful" });
  });

  it("validates picks and blends inside the palette", () => {
    expect(moodPick({ mood: "calm", mood2: "calm" })).toBeNull();
    expect(moodPick({ mood: "other" })).toBeNull();
    expect(moodPick({ mood: "other", note: "Tired" })).toEqual({ mood: "other", note: "Tired" });
    expect(moodBlend({ mood: "calm" })).toBe(moodColorOf("calm"));
    expect(moodBlend({ mood: "calm", mood2: "joyful" })).toBe(blendMoodColors("calm", "joyful"));
    expect(moodBlend({ mood: "other", note: "x" })).toBeNull();
  });
});
