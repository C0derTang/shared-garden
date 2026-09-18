"use server";

import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import {
  parseSongs,
  validSongQuery,
  SONG_PAGE_SIZE,
  type SongPage,
  type SongQuery,
} from "./collection";

const unavailable: SongPage = {
  entries: [],
  more: false,
  error:
    "Songs could not load. Your collection is still saved; try again when connected.",
};

export async function loadSongs(
  query: SongQuery = { kind: "latest" },
): Promise<SongPage> {
  let client;
  try {
    ({ client } = await requireMember({ unavailable: "throw" }));
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return unavailable;
    throw error;
  }
  if (!validSongQuery(query)) return unavailable;
  try {
    // Both tables retain actual-member RLS; no service role or client actor input.
    let request = client
      .from("flower_entries")
      .select(
        "id,flower_id,author_id,garden_day,original_posted_at,updated_at,payload,daisy_assignment_day,flowers!inner(type_key)",
      )
      .eq("flowers.type_key", "tulip")
      .order("id", { ascending: query.kind === "newer" });
    if (query.kind === "older") request = request.lt("id", query.id);
    if (query.kind === "newer") request = request.gt("id", query.id);
    if (query.kind === "updates") request = request.in("id", query.ids);
    const { data, error } = await request.limit(SONG_PAGE_SIZE + 1);
    if (error) return unavailable;
    const rows = parseSongs(data);
    return {
      entries: rows.slice(0, SONG_PAGE_SIZE),
      more: rows.length > SONG_PAGE_SIZE,
      error: null,
    };
  } catch {
    return unavailable;
  }
}
