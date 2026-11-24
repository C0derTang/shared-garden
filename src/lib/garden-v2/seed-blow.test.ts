import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import type { GardenState } from "./model";
import {
  SEEDS_SEEN_LIMIT,
  createSeedBlowPlanner,
  firstBlowPlace,
  parseSeedsSeen,
  readSeedsSeen,
  seedsSeenKey,
  unseenSeedBlows,
  writeSeedsSeen,
} from "./seed-blow";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

/** A garden (seen by member 1) with Dandelions: A fulfilled by `byA`, B by `byB` (null = still waiting). */
function garden(byA: 1 | 2 | null, byB: 1 | 2 | null = null, member: 1 | 2 = 1): GardenState {
  const state = v2GardenFixture();
  state.member_id = member;
  const base = state.plants[0]!;
  const dandelion = (id: string, by: 1 | 2 | null, spot: number) => ({
    ...structuredClone(base),
    flower: {
      ...base.flower,
      id,
      spot,
      type_key: "dandelion" as const,
      shared_wish: "A synthetic wish",
      growth_units: 5,
      first_bloom_at: "2026-11-01T17:00:00Z",
      first_bloom_day: "2026-11-01",
      fulfilled_at: by ? "2026-11-02T17:00:00Z" : null,
      fulfilled_by: by,
    },
  });
  state.plants = [base, dandelion(A, byA, 2), dandelion(B, byB, 3)];
  return state;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("remembering watched seeds", () => {
  it("keeps only flower ids per member slot, newest last, capped", () => {
    writeSeedsSeen(2, A);
    writeSeedsSeen(2, B);
    writeSeedsSeen(2, A);
    expect(window.localStorage.getItem(seedsSeenKey(2))).toBe(JSON.stringify({ ids: [B, A] }));
    expect(readSeedsSeen(2)).toEqual(new Set([A, B]));
    expect(readSeedsSeen(1)).toEqual(new Set());
    for (let i = 0; i < SEEDS_SEEN_LIMIT + 5; i += 1) writeSeedsSeen(1, i.toString(16).padStart(8, "0"));
    expect(parseSeedsSeen(window.localStorage.getItem(seedsSeenKey(1)))).toHaveLength(SEEDS_SEEN_LIMIT);
  });

  it("treats damaged values as nothing seen and unreadable storage as unknown", () => {
    expect(parseSeedsSeen("not json")).toEqual([]);
    expect(parseSeedsSeen(JSON.stringify({ ids: [A, 3, "<script>", null] }))).toEqual([A]);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSeedsSeen(1)).toBeUndefined();
    expect(() => writeSeedsSeen(1, A)).not.toThrow();
  });
});

describe("which blows are waiting", () => {
  it("lists the partner's fulfilled Dandelions not yet watched, never your own", () => {
    expect(unseenSeedBlows(garden(2, 2), new Set())).toEqual([A, B]);
    expect(unseenSeedBlows(garden(2, 2), new Set([A]))).toEqual([B]);
    expect(unseenSeedBlows(garden(1, null), new Set())).toEqual([]);
    expect(unseenSeedBlows(garden(1, 1, 2), new Set())).toEqual([A, B]);
    // Unreadable storage: nothing plays by itself (it could repeat every visit).
    expect(unseenSeedBlows(garden(2, 2), undefined)).toEqual([]);
  });

  it("plays first in the painting when it is open on that flower", () => {
    expect(firstBlowPlace(A, A)).toBe("hero");
    expect(firstBlowPlace(A, B)).toBe("world");
    expect(firstBlowPlace(A, null)).toBe("world");
  });
});

describe("the once-per-member plan", () => {
  it("blows the seeds for the member who fulfils the wish in the painting, then in the world, once", () => {
    const planner = createSeedBlowPlanner();
    expect(planner.notice(garden(null), new Set(), A)).toEqual([]);
    expect(planner.fulfilled(A)).toEqual([
      { kind: "hero", flowerId: A },
      { kind: "world", flowerId: A },
      { kind: "seen", flowerId: A },
    ]);
    // The refreshed state (fulfilled by you) and a repeated confirmation add nothing.
    expect(planner.notice(garden(1), new Set([A]), A)).toEqual([]);
    expect(planner.fulfilled(A)).toEqual([]);
  });

  it("shows the partner the blow once, the first time they see the flower in the world", () => {
    const planner = createSeedBlowPlanner();
    expect(planner.notice(garden(2), new Set(), null)).toEqual([{ kind: "world", flowerId: A }]);
    // A later state while it waits plans nothing new.
    expect(planner.notice(garden(2), new Set(), null)).toEqual([]);
    expect(planner.worldStarted(A)).toEqual([{ kind: "seen", flowerId: A }]);
    // Opening its painting afterwards shows the golden head directly.
    expect(planner.notice(garden(2), new Set([A]), A)).toEqual([]);
  });

  it("plays in the painting when the partner opens the flower first, and again as they return", () => {
    const linked = createSeedBlowPlanner();
    // Arriving by a link straight into its painting.
    expect(linked.notice(garden(2), new Set(), A)).toEqual([
      { kind: "hero", flowerId: A },
      { kind: "world", flowerId: A },
      { kind: "seen", flowerId: A },
    ]);
    const later = createSeedBlowPlanner();
    expect(later.notice(garden(2), new Set(), null)).toEqual([{ kind: "world", flowerId: A }]);
    // Opened before the world showed it: the painting plays it; the world still waits for the return.
    expect(later.notice(garden(2), new Set(), A)).toEqual([
      { kind: "hero", flowerId: A },
      { kind: "seen", flowerId: A },
    ]);
    expect(later.notice(garden(2), new Set([A]), A)).toEqual([]);
  });

  it("plays nothing for Dandelions already watched in this browser, or when storage is unreadable", () => {
    const planner = createSeedBlowPlanner();
    expect(planner.notice(garden(2, 2), new Set([A, B]), A)).toEqual([]);
    expect(createSeedBlowPlanner().notice(garden(2, 2), undefined, A)).toEqual([]);
  });

  it("notices a wish the partner makes come true while you are in the garden", () => {
    const planner = createSeedBlowPlanner();
    expect(planner.notice(garden(null), new Set(), null)).toEqual([]);
    expect(planner.notice(garden(2), new Set(), null)).toEqual([{ kind: "world", flowerId: A }]);
  });
});
