import type { MemorySource } from "@/lib/memories/use-memories";
import { loadMemoriesV2 } from "./memory-actions";
import { subscribeGardenV2 } from "./realtime";

/**
 * New-garden Memories and Songs: the legacy feed contract (decision 0018) over
 * `v2_memories_page` and the new garden's invalidation channel.
 */
export const v2MemorySource: MemorySource = {
  load: (query) => loadMemoriesV2(query),
  subscribe: (client, refresh, connected) => subscribeGardenV2(client, refresh, connected),
};
