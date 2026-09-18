import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { AuthConfig } from "@/lib/auth/config";

import { AUTH_COOKIE, cookieOptions } from "@/lib/auth/cookies";
export { AUTH_COOKIE, cookieOptions } from "@/lib/auth/cookies";
export const PRIVATE_CACHE =
  "private, no-cache, no-store, must-revalidate, max-age=0";
type CookieWrite = { name: string; value: string; options: CookieOptions };

export function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", PRIVATE_CACHE);
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export function redirectTo(config: AuthConfig | null, path: string) {
  // Callers supply fixed application paths only. Never derive the origin from
  // request.url, Host, forwarded headers, or callback query parameters.
  return noStore(
    new NextResponse(null, {
      status: 303,
      headers: { Location: config ? `${config.appOrigin}${path}` : path },
    }),
  );
}

export function sameOriginPost(request: NextRequest, config: AuthConfig) {
  return request.headers.get("origin") === config.appOrigin;
}

export function createRequestClient(request: NextRequest, config: AuthConfig) {
  const writes = new Map<string, CookieWrite>();
  const cacheHeaders = new Headers();
  const options = cookieOptions(config);
  const client = createServerClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      cookieOptions: { name: AUTH_COOKIE, ...options },
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies, headers) {
          for (const cookie of cookies) {
            // The proxy's downstream render must receive the refreshed token too.
            request.cookies.set(cookie.name, cookie.value);
            writes.set(cookie.name, cookie);
          }
          for (const [key, value] of Object.entries(headers))
            cacheHeaders.set(key, value);
        },
      },
    },
  );
  return {
    client,
    finish(response: NextResponse) {
      for (const { name, value, options } of writes.values())
        response.cookies.set(name, value, options);
      cacheHeaders.forEach((value, key) => response.headers.set(key, value));
      return noStore(response);
    },
    clearVerifier() {
      for (const { name } of request.cookies.getAll()) {
        if (
          name.startsWith(`${AUTH_COOKIE}-`) &&
          /-code-verifier(?:\.\d+)?$/.test(name)
        ) {
          writes.set(name, {
            name,
            value: "",
            options: { ...options, maxAge: 0 },
          });
        }
      }
    },
    clearSession() {
      // Clear all SDK chunks, including stale chunks, even if remote revocation
      // fails. No unrelated site cookies are touched.
      for (const { name } of request.cookies.getAll()) {
        if (
          name === AUTH_COOKIE ||
          name.startsWith(`${AUTH_COOKIE}.`) ||
          name.startsWith(`${AUTH_COOKIE}-`)
        ) {
          writes.set(name, {
            name,
            value: "",
            options: { ...options, maxAge: 0 },
          });
        }
      }
    },
  };
}
