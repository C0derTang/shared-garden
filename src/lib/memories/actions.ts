"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import {
  parseMemoryPage,
  validMemoryQuery,
  type MemoryPage,
  type MemoryQuery,
} from "./model";
const unavailable: MemoryPage = {
  items: [],
  more: false,
  error:
    "Memories could not load. Your history is still saved; try again when connected.",
};
export async function loadMemories(
  query: MemoryQuery = { kind: "latest", filters: {} },
): Promise<MemoryPage> {
  let client;
  try {
    ({ client } = await requireMember({ unavailable: "throw" }));
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return unavailable;
    throw error;
  }
  if (!validMemoryQuery(query)) return unavailable;
  try {
    const { data, error } = await client.rpc("memories_page", {
      p_mode: query.kind,
      p_cursor: "cursor" in query ? query.cursor : null,
      p_keys: query.kind === "updates" ? query.keys : null,
      p_type: query.filters.type ?? null,
      p_spot: query.filters.spot ?? null,
      p_from: query.filters.from ?? null,
      p_to: query.filters.to ?? null,
    });
    return error ? unavailable : parseMemoryPage(data);
  } catch {
    return unavailable;
  }
}
