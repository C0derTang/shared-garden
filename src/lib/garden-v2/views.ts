/**
 * The new garden's overlays (decision 0067, issue #183). Memories,
 * Achievements, Songs, Settings and the short guide open over the painted
 * world at `/garden?view=<name>`, so each stays deep-linkable without a new
 * top-level path.
 */
export const gardenViews = {
  memories: "memories",
  achievements: "achievements",
  songs: "our songs",
  settings: "settings",
  guide: "a little guide",
} as const;
export type GardenView = keyof typeof gardenViews;

/** The floating words of the garden's own menu, in reading order. */
export const navViews = ["memories", "achievements", "songs", "settings"] as const satisfies readonly GardenView[];

export const GARDEN_PATH = "/garden";

/** The overlay a query value names, or null for anything unrecognized. */
export function gardenView(value: unknown): GardenView | null {
  return typeof value === "string" && Object.hasOwn(gardenViews, value) ? (value as GardenView) : null;
}

export const gardenViewHref = (view: GardenView) => `${GARDEN_PATH}?view=${view}`;

/** Per-member, per-browser marker that the first-visit guide was seen. */
export const guideKey = (memberId: 1 | 2) => `garden-v2:guide-seen:${memberId}`;

/**
 * Whether the first-visit guide should open. Storage that cannot be read
 * shows nothing, so a private window never repeats the guide on every visit.
 */
export function guideUnseen(memberId: 1 | 2): boolean {
  try {
    return window.localStorage.getItem(guideKey(memberId)) === null;
  } catch {
    return false;
  }
}

export function markGuideSeen(memberId: 1 | 2) {
  try {
    window.localStorage.setItem(guideKey(memberId), "1");
  } catch {
    // Unwritable storage only means the guide may show again next visit.
  }
}
