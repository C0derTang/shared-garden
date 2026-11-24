"use server";

import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
// v2_memories_page keeps the legacy page contract over new-garden content only.
import { parseMemoryPage, validMemoryQuery, type MemoryPage, type MemoryQuery } from "@/lib/memories/model";

const unavailable: MemoryPage = {
  items: [],
  more: false,
  error: "Memories could not load. Your history is still saved; try again when connected.",
};

export async function loadMemoriesV2(query: MemoryQuery = { kind: "latest", filters: {} }): Promise<MemoryPage> {
  let client;
  try {
    ({ client } = await requireMember({ unavailable: "throw" }));
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return unavailable;
    throw error;
  }
  if (!validMemoryQuery(query)) return unavailable;
  try {
    const { data, error } = await client.rpc("v2_memories_page", {
      p_mode: query.kind,
      p_cursor: "cursor" in query ? query.cursor : null,
      p_keys: query.kind === "updates" ? query.keys : null,
      p_type: query.filters.type ?? null,
      p_spot: query.filters.spot ?? null,
      p_from: query.filters.from ?? null,
      p_to: query.filters.to ?? null,
      p_author: query.filters.author ?? null,
    });
    return error ? unavailable : parseMemoryPage(data);
  } catch {
    return unavailable;
  }
}
