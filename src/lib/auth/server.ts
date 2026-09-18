import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AUTH_COOKIE, cookieOptions } from "@/lib/auth/client";
import { getAuthConfig } from "@/lib/auth/config";
import { verifyMember } from "@/lib/auth/member";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";

export async function requireMember(options?: { unavailable?: "throw" }) {
  const config = getAuthConfig();
  if (!config) redirect("/auth/error?reason=setup");
  const store = await cookies();
  const client = createServerClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      cookieOptions: { name: AUTH_COOKIE, ...cookieOptions(config) },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll: () => store.getAll(),
        // Server Components cannot write cookies. The proxy refreshes and sends
        // them to both this render and the browser before this guard runs.
        setAll() {},
      },
    },
  );
  const access = await verifyMember(client);
  if (access.status === "unavailable" && options?.unavailable === "throw")
    throw new MemberAccessUnavailableError();
  if (access.status !== "allowed")
    redirect(`/auth/error?reason=${access.status}`);
  return { client, member: access.member };
}
