import "server-only";
import { getAuthConfig, type AuthConfig } from "@/lib/auth/config";

// Development-only seeded local sign-in (decision 0067, issue #175). It lets a
// developer demo signed-in screens against the local Supabase stack without
// Google OAuth. It is never usable in a production build: Next.js inlines
// NODE_ENV at build time, so `next build` compiles this check to a constant
// refusal, and the loopback gates below independently refuse any hosted
// origin or service even if a development server were misconfigured.

export const DEV_SIGN_IN_TOKEN = /^[a-z0-9]{12}$/;

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isLoopbackHttpOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

/** Returns the auth config only when every development gate passes. */
export function getDevSignInConfig(): AuthConfig | null {
  // Keep this literal comparison: it is what the production build inlines.
  if (process.env.NODE_ENV !== "development") return null;
  const config = getAuthConfig();
  if (!config) return null;
  if (!isLoopbackHttpOrigin(config.appOrigin)) return null;
  if (!isLoopbackHttpOrigin(config.supabaseUrl)) return null;
  return config;
}
