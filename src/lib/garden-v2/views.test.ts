import { afterEach, expect, it, vi } from "vitest";
import { gardenView, gardenViewHref, guideKey, guideUnseen, markGuideSeen, navViews } from "./views";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

it("recognizes only the garden's own overlays from the query", () => {
  expect(["memories", "achievements", "songs", "settings", "guide"].map(gardenView)).toEqual(["memories", "achievements", "songs", "settings", "guide"]);
  for (const value of [undefined, null, "", "Memories", "toString", "__proto__", ["memories"], "panel"]) expect(gardenView(value)).toBeNull();
  expect(navViews.map(gardenViewHref)).toEqual(["/garden?view=memories", "/garden?view=achievements", "/garden?view=songs", "/garden?view=settings"]);
});

it("remembers the first-visit guide per member in this browser", () => {
  expect(guideUnseen(1)).toBe(true);
  markGuideSeen(1);
  expect(guideUnseen(1)).toBe(false);
  expect(guideUnseen(2)).toBe(true);
  expect(window.localStorage.getItem(guideKey(1))).toBe("1");
});

it("shows nothing when storage cannot be read, and tolerates unwritable storage", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  expect(guideUnseen(1)).toBe(false);
  expect(() => markGuideSeen(1)).not.toThrow();
});
