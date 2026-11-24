import { describe, expect, it } from "vitest";
import { draftHasContent, draftValid, entryPayload } from "./entry-draft";

describe("shared entry drafts", () => {
  it("accepts a Cactus check-in with no fields", () => {
    expect(draftValid("cactus", {})).toBe(true);
    expect(entryPayload("cactus", { text: "ignored" })).toEqual({});
  });

  it("needs trimmed text of up to 4,000 characters for the text flowers", () => {
    for (const type of ["rose", "marigold", "snapdragon", "moonflower", "dandelion", "forget-me-not"]) {
      expect(draftValid(type, { text: "  " })).toBe(false);
      expect(draftValid(type, { text: "A note" })).toBe(true);
      expect(draftValid(type, { text: "x".repeat(4001) })).toBe(false);
      expect(entryPayload(type, { text: "A note", extra: "no" })).toEqual({ text: "A note" });
    }
  });

  it("answers today's Daisy question only", () => {
    expect(draftValid("daisy", { text: "Yes" })).toBe(false);
    expect(draftValid("daisy", { text: "Yes" }, { daisyQuestionId: "q1" })).toBe(true);
    expect(entryPayload("daisy", { text: "Yes" }, { daisyQuestionId: "q1" })).toEqual({ text: "Yes", question_id: "q1" });
  });

  it("needs a song title, artist and HTTPS link for the Tulip", () => {
    const song = { title: "Song", artist: "Artist", url: "https://music.example.com/t/1" };
    expect(draftValid("tulip", song)).toBe(true);
    expect(draftValid("tulip", { ...song, url: "http://music.example.com/t/1" })).toBe(false);
    expect(draftValid("tulip", { ...song, title: "x".repeat(201) })).toBe(false);
    expect(entryPayload("tulip", { ...song, note: "x" })).toEqual(song);
  });

  it("sends only a valid Hydrangea pick", () => {
    expect(draftValid("hydrangea", { mood: "other" })).toBe(false);
    expect(draftValid("hydrangea", { mood: "calm", mood2: "low" })).toBe(true);
    expect(entryPayload("hydrangea", { mood: "calm", mood2: "low", note: "Nice" })).toEqual({ mood: "calm", mood2: "low", note: "Nice" });
  });

  it("knows when a draft holds anything", () => {
    expect(draftHasContent({ text: "  " })).toBe(false);
    expect(draftHasContent({ text: "a" })).toBe(true);
  });
});
