import { afterEach, describe, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import {
  clearSpotRequest,
  parseSpotRequest,
  requestSpot,
  resolveSpotRequest,
  settleSpotRequest,
  spotRequestSnapshot,
  subscribeSpotRequest,
} from "./spot-request";

function withRose() {
  const state = gardenFixture();
  const cactus = state.plants[0];
  state.plants.push({ ...cactus, flower: { ...cactus.flower, id: "rose", type_key: "rose", spot: 2, is_initial: false } });
  return state;
}
afterEach(() => clearSpotRequest());

describe("spot requests", () => {
  it("reads spot and Cactus requests from a URL and keeps malformed spots explainable", () => {
    expect(parseSpotRequest("?spot=2")).toEqual({ spot: 2 });
    expect(parseSpotRequest("?flower=cactus")).toEqual({ flower: "cactus" });
    expect(parseSpotRequest("?spot=abc")).toEqual({ spot: -1 });
    expect(parseSpotRequest("?flower=rose")).toBeNull();
    expect(parseSpotRequest("")).toBeNull();
  });
  it("opens only planted spots and explains unknown, empty and missing flowers", () => {
    const state = withRose();
    expect(resolveSpotRequest({ spot: 2 }, state)).toEqual({ spot: 2 });
    expect(resolveSpotRequest({ flower: "cactus" }, state)).toEqual({ spot: 1 });
    expect(resolveSpotRequest({ spot: 5 }, state)).toEqual({ notice: "Spot 5 has no flower right now." });
    expect(resolveSpotRequest({ spot: 13 }, state)).toEqual({ notice: "That flower isn’t in your garden." });
    expect(resolveSpotRequest({ spot: -1 }, state)).toEqual({ notice: "That flower isn’t in your garden." });
    state.plants = [];
    expect(resolveSpotRequest({ flower: "cactus" }, state)).toEqual({ notice: "The Cactus isn’t in the garden right now." });
  });
  it("keeps one pending request, replaces an old notice and notifies subscribers", () => {
    const listener = vi.fn();
    const stop = subscribeSpotRequest(listener);
    settleSpotRequest("Spot 5 has no flower right now.");
    requestSpot({ spot: 3 });
    expect(spotRequestSnapshot()).toEqual({ request: { spot: 3 }, notice: "" });
    clearSpotRequest();
    expect(spotRequestSnapshot()).toEqual({ request: null, notice: "" });
    clearSpotRequest();
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
    requestSpot({ spot: 4 });
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
