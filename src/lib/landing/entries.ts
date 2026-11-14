import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getAuthConfig, type AuthConfig } from "@/lib/auth/config";
import { AUTH_COOKIE, cookieOptions } from "@/lib/auth/cookies";
import { partnerDisplayName } from "@/lib/auth/display-names";
import { verifyMember } from "@/lib/auth/member";
import {
  compareMemories,
  parseMemoryPage,
  type MemoryItem,
} from "@/lib/memories/model";
import {
  landingFlowers,
  type LandingData,
  type LandingEntry,
  type LandingFlower,
} from "./types";

/** Newest entries kept per flower carousel. */
export const LANDING_ENTRY_LIMIT = 12;
/** Longest displayed text, in code points, including the ellipsis. */
export const LANDING_TEXT_LIMIT = 220;

type Names = Record<1 | 2, string | null>;

/**
 * Loads the home page carousels. Private entries are read only after the
 * request's session is verified as one of the two members. Everyone else, and
 * every authorization failure, gets only the login control. Home never redirects.
 */
export async function loadLandingData(): Promise<LandingData> {
  const config = getAuthConfig();
  if (!config) return { status: "visitor" };
  let client: SupabaseClient;
  try {
    client = await landingClient(config);
    const access = await verifyMember(client);
    if (access.status !== "allowed") return { status: "visitor" };
  } catch (error) {
    // Let Next.js control-flow signals (such as dynamic-rendering bailouts
    // from cookies()) through; any real failure shows no private content.
    unstable_rethrow(error);
    return { status: "visitor" };
  }
  // partnerDisplayName(x) names the member who is not x, so each author's own
  // name is read through the opposite slot. Names are presentation only.
  const names: Names = { 1: partnerDisplayName(2), 2: partnerDisplayName(1) };
  const lists = await Promise.all(
    landingFlowers.map((flower) => loadFlower(client, flower, names)),
  );
  const entries = Object.fromEntries(
    landingFlowers.map((flower, i) => [flower, lists[i] ?? []]),
  ) as Record<LandingFlower, LandingEntry[]>;
  const unavailable = landingFlowers.filter((_, i) => lists[i] === null);
  return { status: "member", entries, ...(unavailable.length ? { unavailable } : {}) };
}

/** Same client setup as requireMember; Server Components cannot write cookies. */
async function landingClient(config: AuthConfig): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(config.supabaseUrl, config.supabasePublishableKey, {
    cookieOptions: { name: AUTH_COOKIE, ...cookieOptions(config) },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
    },
    cookies: {
      getAll: () => store.getAll(),
      setAll() {},
    },
  });
}

async function loadFlower(
  client: SupabaseClient,
  flower: LandingFlower,
  names: Names,
): Promise<LandingEntry[] | null> {
  try {
    const { data, error } = await client.rpc("memories_page", {
      p_mode: "latest",
      p_cursor: null,
      p_keys: null,
      p_type: flower,
      p_spot: null,
      p_from: null,
      p_to: null,
      p_author: null,
    });
    if (error) return null;
    return toLandingEntries(parseMemoryPage(data).items, flower, names);
  } catch (error) {
    unstable_rethrow(error);
    // One flower failing leaves the other carousels intact. Nothing is logged.
    return null;
  }
}

function toLandingEntries(
  items: MemoryItem[],
  flower: LandingFlower,
  names: Names,
): LandingEntry[] {
  const result: LandingEntry[] = [];
  for (const item of [...items].sort((a, b) => compareMemories(b, a))) {
    if (result.length >= LANDING_ENTRY_LIMIT) break;
    if (item.kind !== "entry" || !item.entry || item.flower.type_key !== flower)
      continue;
    const text = entryText(flower, item.entry.payload);
    if (!text) continue;
    result.push({
      id: item.source_id,
      flower,
      text: truncateText(text),
      author: names[item.entry.author_id],
      day: item.garden_day,
    });
  }
  return result;
}

function entryText(flower: LandingFlower, payload: Record<string, string>) {
  if (flower !== "tulip") return (payload.text ?? "").trim();
  const title = (payload.title ?? "").trim();
  const artist = (payload.artist ?? "").trim();
  // A song needs its title; the artist is optional.
  if (!title) return "";
  return artist ? `${title} — ${artist}` : title;
}

/** Shortens long text at a word boundary, counting code points, with "…". */
export function truncateText(text: string, limit = LANDING_TEXT_LIMIT): string {
  const chars = Array.from(text);
  if (chars.length <= limit) return text;
  const room = limit - 1;
  let cut = room;
  for (let i = room; i > 0; i--) {
    if (/\s/u.test(chars[i])) {
      cut = i;
      break;
    }
  }
  // A single very long word (a link, unspaced script) is cut mid-word instead
  // of discarding most of the text.
  if (cut < Math.floor(room / 2)) cut = room;
  return `${chars.slice(0, cut).join("").trimEnd()}…`;
}
