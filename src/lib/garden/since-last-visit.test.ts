import { describe, expect, it } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { GardenState, Plant } from "./model";
import {
  diffSnapshot,
  hasNews,
  mergeNews,
  nameList,
  parseSnapshot,
  snapshotKey,
  takeSnapshot,
  unreadBadges,
} from "./since-last-visit";

function plant(state: GardenState, id: string, type: Plant["flower"]["type_key"], spot: number): Plant {
  const base = state.plants[0];
  return { ...base, flower: { ...base.flower, id, type_key: type, spot, is_initial: false }, entries: [] };
}
function garden() {
  const state = gardenFixture();
  state.plants.push(plant(state, "rose-1", "rose", 2), plant(state, "tulip-1", "tulip", 3));
  return state;
}
const badges = [{ id: "first-seed", title: "First seed" }];

describe("since-last-visit diff", () => {
  it("shows nothing on a first visit, even with blooms, care and badges present", () => {
    const state = garden();
    state.plants[1].flower.first_bloom_at = state.server_now;
    state.plants[1].member2_submitted = true;
    expect(hasNews(diffSnapshot(null, state, badges))).toBe(false);
  });

  it("finds a new bloom and a new unlock", () => {
    const before = garden();
    const snapshot = takeSnapshot(before, badges, null);
    const after = garden();
    after.plants[1].flower.first_bloom_at = "2026-09-19T11:00:00Z";
    after.unlocks.push({ type_key: "daisy", unlocked_at: "2026-09-19T11:00:00Z" });
    const news = diffSnapshot(snapshot, after, badges);
    expect(news.blooms.map((p) => p.flower.id)).toEqual(["rose-1"]);
    expect(news.unlocks.map((u) => u.type_key)).toEqual(["daisy"]);
    expect(news.partnerCare).toEqual([]);
    expect(news.badges).toEqual([]);
    // Once seen, the same bloom and unlock are not news again.
    expect(hasNews(diffSnapshot(takeSnapshot(after, badges, snapshot), after, badges))).toBe(false);
  });

  it("finds partner care, never your own, and restarts the day after a rollover", () => {
    const before = garden();
    before.plants[1].member2_submitted = true;
    const snapshot = takeSnapshot(before, null, null);
    const after = garden();
    after.plants[1].member2_submitted = true;
    after.plants[2].member2_submitted = true;
    after.plants[0].member1_submitted = true; // You (member 1) cared: not news.
    expect(diffSnapshot(snapshot, after, null).partnerCare.map((p) => p.flower.id)).toEqual(["tulip-1"]);

    const nextDay = garden();
    nextDay.garden_day = "2026-09-19";
    nextDay.plants[1].member2_submitted = true;
    expect(diffSnapshot(snapshot, nextDay, null).partnerCare.map((p) => p.flower.id)).toEqual(["rose-1"]);
  });

  it("uses the partner's flag for member 2", () => {
    const before = garden();
    before.member_id = 2;
    const snapshot = takeSnapshot(before, null, null);
    const after = garden();
    after.member_id = 2;
    after.plants[1].member1_submitted = true;
    after.plants[2].member2_submitted = true;
    expect(diffSnapshot(snapshot, after, null).partnerCare.map((p) => p.flower.id)).toEqual(["rose-1"]);
  });

  it("finds a new badge only after a baseline of earned badges exists", () => {
    const state = garden();
    const withoutBadges = takeSnapshot(state, null, null);
    const earned = [...badges, { id: "streak-3", title: "Three-day streak" }];
    // The first successful read becomes the baseline: nothing to celebrate.
    expect(diffSnapshot(withoutBadges, state, earned).badges).toEqual([]);
    const baseline = takeSnapshot(state, badges, withoutBadges);
    expect(baseline.badges).toEqual(["first-seed"]);
    expect(baseline.badgesViewed).toEqual(["first-seed"]);
    expect(diffSnapshot(baseline, state, earned).badges).toEqual([{ id: "streak-3", title: "Three-day streak" }]);
    // A failed read keeps the previous badges instead of forgetting them.
    expect(takeSnapshot(state, null, baseline).badges).toEqual(["first-seed"]);
    const next = takeSnapshot(state, earned, baseline);
    expect(unreadBadges(next)).toBe(1);
  });

  it("stores only ids, type keys and the garden day", () => {
    const state = garden();
    state.plants[1].flower.shared_wish = "a private wish";
    state.plants[1].member2_submitted = true;
    state.plants[1].entries = [{ id: 7, flower_id: "rose-1", author_id: 2, garden_day: state.garden_day, original_posted_at: state.server_now, updated_at: state.server_now, payload: { text: "private note" }, daisy_assignment_day: null }];
    const stored = JSON.stringify(takeSnapshot(state, badges, null));
    expect(stored).not.toMatch(/private/);
    expect(snapshotKey(state)).toBe("ccsgarden:since-last-visit:v1:1:1");
  });

  it("treats malformed or foreign storage as no snapshot", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("{not json")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ v: 2 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ v: 1, blooms: [1], unlocks: [], careDay: "", partnerCare: [], badges: null, badgesViewed: null }))).toBeNull();
    const snapshot = takeSnapshot(garden(), null, null);
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("merges live news without repeating a line and names flowers briefly", () => {
    const state = garden();
    const first = { blooms: [state.plants[1]], unlocks: [], partnerCare: [], badges: [] };
    const merged = mergeNews(first, { ...first, partnerCare: [state.plants[2]] });
    expect(merged.blooms).toHaveLength(1);
    expect(merged.partnerCare).toHaveLength(1);
    expect(nameList(["Rose"])).toBe("Rose");
    expect(nameList(["Rose", "Tulip"])).toBe("Rose and Tulip");
    expect(nameList(["Rose", "Rose", "Tulip"])).toBe("Rose ×2 and Tulip");
    expect(nameList(["Rose", "Tulip", "Daisy"])).toBe("Rose, Tulip and Daisy");
    expect(nameList(["Rose", "Tulip", "Daisy", "Marigold"])).toBe("Rose, Tulip and 2 more");
  });
});
