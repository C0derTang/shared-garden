import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getAuthConfig, type AuthConfig } from "@/lib/auth/config";
import { AUTH_COOKIE, cookieOptions } from "@/lib/auth/cookies";
import { verifyMember } from "@/lib/auth/member";
import type { LandingData } from "./types";

/** Verify the live two-member boundary without loading unused garden entries. */
export async function loadLandingAccess(): Promise<LandingData> {
  const config = getAuthConfig();
  if (!config) return { status: "visitor" };
  try {
    const client = await landingClient(config);
    const access = await verifyMember(client);
    if (access.status !== "allowed") return { status: "visitor" };
  } catch (error) {
    // Let Next.js control-flow signals (such as dynamic-rendering bailouts
    // from cookies()) through; any real failure shows no private content.
    unstable_rethrow(error);
    return { status: "visitor" };
  }
  return { status: "member" };
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
