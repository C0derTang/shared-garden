/**
 * When a Dandelion's seeds blow away (#201, decision 0067). The member who
 * makes the wish come true sees the seeds blow in the flower's painting at
 * once, and again in the world when they return to it. Their partner sees it
 * once, the first time they see that fulfilled Dandelion (in the world or in
 * its painting); this browser remembers which Dandelions each member has
 * watched (flower ids only, per member slot). Later visits show the golden
 * head directly.
 */
import type { GardenState } from "./model";

/** Most flower ids remembered per member (oldest forgotten first). */
export const SEEDS_SEEN_LIMIT = 200;

const ID = /^[0-9a-f-]{1,64}$/i;

export const seedsSeenKey = (memberId: number) => `garden-v2:dandelion-seeds:${memberId}`;

/** The remembered flower ids in a stored value (anything unreadable remembers nothing). */
export function parseSeedsSeen(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const ids = parsed && typeof parsed === "object" ? (parsed as { ids?: unknown }).ids : undefined;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && ID.test(id)).slice(-SEEDS_SEEN_LIMIT) : [];
  } catch {
    return [];
  }
}

/**
 * The Dandelions whose blowing seeds this member has watched in this browser,
 * or `undefined` when local storage cannot be read (then nothing plays by
 * itself, since it could otherwise repeat on every visit).
 */
export function readSeedsSeen(memberId: number): ReadonlySet<string> | undefined {
  try {
    return new Set(parseSeedsSeen(window.localStorage.getItem(seedsSeenKey(memberId))));
  } catch {
    return undefined;
  }
}

/** Remembers that this member watched a Dandelion's seeds blow away. */
export function writeSeedsSeen(memberId: number, flowerId: string): void {
  try {
    const ids = parseSeedsSeen(window.localStorage.getItem(seedsSeenKey(memberId))).filter((id) => id !== flowerId);
    ids.push(flowerId);
    window.localStorage.setItem(seedsSeenKey(memberId), JSON.stringify({ ids: ids.slice(-SEEDS_SEEN_LIMIT) }));
  } catch {
    // Unwritable storage: the partner's view may blow the seeds again on a later visit.
  }
}

/**
 * Dandelions whose wish the partner made come true and whose seeds this
 * member has not yet watched blow away. A wish you fulfilled yourself is
 * never replayed from here (you watched it as you blew the seeds).
 */
export function unseenSeedBlows(state: Pick<GardenState, "member_id" | "plants">, seen: ReadonlySet<string> | undefined): string[] {
  if (!seen) return [];
  return state.plants
    .filter(({ flower }) => flower.type_key === "dandelion" && flower.fulfilled_at !== null && flower.fulfilled_by !== state.member_id && !seen.has(flower.id))
    .map(({ flower }) => flower.id);
}

/** Where a newly noticed blow plays first: in the open flower's painting, or in the world when it comes into view. */
export function firstBlowPlace(flowerId: string, openFlowerId: string | null): "hero" | "world" {
  return openFlowerId === flowerId ? "hero" : "world";
}

/** What the garden does about a Dandelion's seeds. */
export type SeedBlowAction =
  /** Blow its seeds in the open flower's painting now. */
  | { readonly kind: "hero"; readonly flowerId: string }
  /** Blow its seeds in the world the first moment it is in view (on return from its painting). */
  | { readonly kind: "world"; readonly flowerId: string }
  /** Remember that this member watched it. */
  | { readonly kind: "seen"; readonly flowerId: string };

export interface SeedBlowPlanner {
  /** You made its wish come true (from its painting). */
  fulfilled(flowerId: string): SeedBlowAction[];
  /** The garden state, this browser's memory or the open flower changed. */
  notice(state: Pick<GardenState, "member_id" | "plants">, seen: ReadonlySet<string> | undefined, openFlowerId: string | null): SeedBlowAction[];
  /** The world began blowing its seeds (it came into view). */
  worldStarted(flowerId: string): SeedBlowAction[];
}

/**
 * The once-per-member rules as a small state machine for one visit. Every
 * blow that plays in a painting also plays in the world on return (the
 * camera glides back to the flower as its seeds drift off). A partner's
 * fulfilled Dandelion noticed while its painting is closed waits for the
 * world; opening its painting first plays it there instead.
 */
export function createSeedBlowPlanner(): SeedBlowPlanner {
  /** Flowers this visit has already planned a blow for. */
  const planned = new Set<string>();
  /** Planned for the world and not yet seen anywhere. */
  const waiting = new Set<string>();
  return {
    fulfilled(flowerId) {
      // A wish comes true once; a repeated confirmation plays nothing new.
      if (planned.has(flowerId)) return [];
      planned.add(flowerId);
      return [
        { kind: "hero", flowerId },
        { kind: "world", flowerId },
        { kind: "seen", flowerId },
      ];
    },
    notice(state, seen, openFlowerId) {
      const actions: SeedBlowAction[] = [];
      for (const flowerId of unseenSeedBlows(state, seen)) {
        if (planned.has(flowerId)) continue;
        planned.add(flowerId);
        if (firstBlowPlace(flowerId, openFlowerId) === "hero") {
          actions.push({ kind: "hero", flowerId }, { kind: "world", flowerId }, { kind: "seen", flowerId });
        } else {
          waiting.add(flowerId);
          actions.push({ kind: "world", flowerId });
        }
      }
      if (openFlowerId !== null && waiting.has(openFlowerId)) {
        waiting.delete(openFlowerId);
        actions.push({ kind: "hero", flowerId: openFlowerId }, { kind: "seen", flowerId: openFlowerId });
      }
      return actions;
    },
    worldStarted(flowerId) {
      waiting.delete(flowerId);
      return [{ kind: "seen", flowerId }];
    },
  };
}
