"use client";
import { useGardenSync, type GardenSource } from "@/lib/garden/use-garden-sync";
import { mutateGardenV2, refreshGardenV2 } from "./actions";
import type { GardenCommand, GardenResult, GardenState } from "./model";
import { subscribeGardenV2 } from "./realtime";

const v2Source: GardenSource<GardenState, GardenCommand> = {
  refresh: () => refreshGardenV2(),
  mutate: (command) => mutateGardenV2(command),
  subscribe: (client, refresh, connected) => subscribeGardenV2(client, refresh, connected),
};

/**
 * The new garden's synchronized state: the same sync rules as the legacy
 * garden (Realtime invalidation, focus and 30-second reads, a monotonic server
 * clock and one guarded mutation at a time) over the v2 actions and channel.
 */
export function useGardenV2(initial: GardenResult) {
  return useGardenSync(initial, v2Source);
}
