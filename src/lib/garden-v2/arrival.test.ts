import { afterEach, describe, expect, it, vi } from "vitest";
import { ARRIVAL_KEY, ARRIVAL_TTL_MS, clearGardenArrival, markGardenArrival, readGardenArrival } from "./arrival";

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("the walk-through's handoff to the garden", () => {
  it("is marked in session storage, read without being used up, and cleared", () => {
    expect(readGardenArrival()).toBe(false);
    markGardenArrival(1000);
    expect(window.sessionStorage.getItem(ARRIVAL_KEY)).toBe("1000");
    expect(readGardenArrival(1500)).toBe(true);
    expect(readGardenArrival(1500)).toBe(true);
    clearGardenArrival();
    expect(readGardenArrival(1500)).toBe(false);
  });

  it("is never part of the address", () => {
    markGardenArrival();
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("ignores a stale, future or unreadable mark", () => {
    markGardenArrival(1000);
    expect(readGardenArrival(1000 + ARRIVAL_TTL_MS)).toBe(false);
    expect(readGardenArrival(999)).toBe(false);
    window.sessionStorage.setItem(ARRIVAL_KEY, "soon");
    expect(readGardenArrival(1000)).toBe(false);
  });

  it("opens the garden normally when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markGardenArrival()).not.toThrow();
    expect(readGardenArrival()).toBe(false);
    expect(() => clearGardenArrival()).not.toThrow();
  });
});
