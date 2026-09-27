import type { GardenState } from "./model";

/**
 * A request to open one flower in the garden (decision 0055). It comes from a
 * direct `/garden?spot=N` or `/garden?flower=cactus` URL, or from an in-app
 * link that also records it here, so the persistent garden can open the sheet
 * once the route panel above it has closed.
 */
export type SpotRequest = { spot: number } | { flower: "cactus" };
export type SpotResolution = { spot: number } | { notice: string };

/** The pending request, or the notice left by the last one that could not open. */
export type SpotRequestSnapshot = { request: SpotRequest | null; notice: string };
let snapshot: SpotRequestSnapshot = { request: null, notice: "" };
const listeners = new Set<() => void>();
function set(next: SpotRequestSnapshot) {
  if (next.request === snapshot.request && next.notice === snapshot.notice) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function requestSpot(request: SpotRequest) {
  set({ request, notice: "" });
}
/** Ends the pending request, optionally explaining why it could not open. */
export function settleSpotRequest(notice = "") {
  set({ request: null, notice });
}
export const clearSpotRequest = () => settleSpotRequest();
export function subscribeSpotRequest(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export const spotRequestSnapshot = () => snapshot;
const empty: SpotRequestSnapshot = { request: null, notice: "" };
export const serverSpotRequestSnapshot = () => empty;

export const spotHref = (spot: number) => `/garden?spot=${spot}`;
export const cactusHref = "/garden?flower=cactus";

/** Reads a request from a URL query. Anything unrecognized is ignored. */
export function parseSpotRequest(search: string): SpotRequest | null {
  const params = new URLSearchParams(search);
  if (params.get("flower") === "cactus") return { flower: "cactus" };
  const raw = params.get("spot");
  if (raw === null) return null;
  // Keep malformed values so the garden can explain that the spot is unknown.
  return { spot: /^\d{1,10}$/.test(raw) ? Number(raw) : -1 };
}

/** Matches a request to a current flower, or explains why it cannot open. */
export function resolveSpotRequest(
  request: SpotRequest,
  state: GardenState,
): SpotResolution {
  if ("flower" in request) {
    const cactus = state.plants.find((p) => p.flower.type_key === "cactus");
    return cactus
      ? { spot: cactus.flower.spot }
      : { notice: "The Cactus isn’t in the garden right now." };
  }
  const { spot } = request;
  if (!Number.isSafeInteger(spot) || spot < 1 || spot > state.garden.spot_capacity)
    return { notice: "That flower isn’t in your garden." };
  if (!state.plants.some((p) => p.flower.spot === spot))
    return { notice: `Spot ${spot} has no flower right now.` };
  return { spot };
}
