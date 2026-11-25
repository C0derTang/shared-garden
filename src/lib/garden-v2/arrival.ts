/**
 * The handoff from the landing's walk through the door to the garden's
 * arrival (#204). The landing marks the arrival in this tab's session storage
 * just before it navigates; the garden reads it on its first render and clears
 * it, so a refresh, a deep link or a direct visit never replays the arrival.
 * It is never part of the URL.
 */

export const ARRIVAL_KEY = "garden-v2:arrival";
/** A mark older than this (ms) is ignored, e.g. a navigation that never reached the garden. */
export const ARRIVAL_TTL_MS = 20_000;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** The landing is about to open the garden after the walk-through. */
export function markGardenArrival(now = Date.now()): void {
  try {
    storage()?.setItem(ARRIVAL_KEY, String(now));
  } catch {
    // Without storage the garden simply opens as on a direct visit.
  }
}

/** Whether the garden is being opened by the walk-through (read only; see `clearGardenArrival`). */
export function readGardenArrival(now = Date.now()): boolean {
  try {
    const raw = storage()?.getItem(ARRIVAL_KEY);
    if (raw === null || raw === undefined) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at >= 0 && now - at < ARRIVAL_TTL_MS;
  } catch {
    return false;
  }
}

/** The arrival is used up: later visits in this tab open normally. */
export function clearGardenArrival(): void {
  try {
    storage()?.removeItem(ARRIVAL_KEY);
  } catch {
    // Nothing to clear.
  }
}
