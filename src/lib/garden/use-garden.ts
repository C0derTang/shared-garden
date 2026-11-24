"use client";
import { mutateGarden, refreshGarden } from "./actions";
import { subscribeGarden } from "./realtime";
import type { GardenCommand, GardenResult, GardenState } from "./model";
import { useGardenSync, type GardenSource, type SyncMutation } from "./use-garden-sync";

export type GardenMutation = SyncMutation<GardenCommand>;

const legacySource: GardenSource<GardenState, GardenCommand> = {
  refresh: () => refreshGarden(),
  mutate: (command) => mutateGarden(command),
  subscribe: (client, refresh, connected) => subscribeGarden(client, refresh, connected),
};

/** The legacy garden's synchronized state (see `useGardenSync`). */
export function useGarden(initial: GardenResult) {
  return useGardenSync(initial, legacySource);
}
