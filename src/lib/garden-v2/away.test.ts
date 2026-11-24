import { afterEach, describe, expect, it, vi } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { awayKey, diffAway, hasAwayNews, parseAwaySnapshot, readAwaySnapshot, takeAwaySnapshot, writeAwaySnapshot } from "./away";
import type { GardenState } from "./model";

function later(state: GardenState, change: (next: GardenState) => void) {
  const next = structuredClone(state);
  change(next);
  return next;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("while you were away", () => {
  const state = v2GardenFixture();

  it("shows nothing on a first visit or an unreadable snapshot", () => {
    expect(hasAwayNews(diffAway(null, state))).toBe(false);
    expect(parseAwaySnapshot("{")).toBeNull();
    expect(parseAwaySnapshot(JSON.stringify({ v: 1, growth: { a: "x" }, blooms: [], fulfilled: [], careDay: "d", partnerCare: [] }))).toBeNull();
  });

  it("finds new flowers from your partner, growth, blooms, wishes and today's partner care", () => {
    const snapshot = takeAwaySnapshot(state);
    const next = later(state, (s) => {
      const rose = s.plants[0]!;
      rose.flower.growth_units = 1;
      rose.member2_submitted = true;
      s.plants.push({ ...structuredClone(rose), flower: { ...rose.flower, id: "new", spot: 2, planted_by: 2, growth_units: 0 }, member2_submitted: false });
    });
    const news = diffAway(snapshot, next);
    expect(news.planted.map((p) => p.flower.id)).toEqual(["new"]);
    expect(news.grew.map((p) => p.flower.id)).toEqual([state.plants[0]!.flower.id]);
    expect(news.partnerCare).toHaveLength(1);
    // Your own planting is not news to you.
    const mine = later(next, (s) => (s.plants[1]!.flower.planted_by = 1));
    expect(diffAway(snapshot, mine).planted).toHaveLength(0);
  });

  it("counts a bloom once, not also as growth", () => {
    const snapshot = takeAwaySnapshot(state);
    const next = later(state, (s) => {
      s.plants[0]!.flower.growth_units = 5;
      s.plants[0]!.flower.first_bloom_at = "2026-11-03T12:00:00Z";
      s.plants[0]!.flower.first_bloom_day = "2026-11-02";
    });
    const news = diffAway(snapshot, next);
    expect(news.bloomed).toHaveLength(1);
    expect(news.grew).toHaveLength(0);
  });

  it("stores only ids and numbers, per member", () => {
    expect(writeAwaySnapshot(1, takeAwaySnapshot(state))).toBe(true);
    const raw = window.localStorage.getItem(awayKey(1))!;
    expect(raw).not.toContain("synthetic note");
    expect(readAwaySnapshot(1)).toMatchObject({ ok: true });
    expect(readAwaySnapshot(2)).toEqual({ ok: true, snapshot: null });
  });

  it("treats blocked storage as no news", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readAwaySnapshot(1)).toEqual({ ok: false });
  });
});
