import type { CookieOptions } from "@supabase/ssr";

export const AUTH_COOKIE = "sg-auth";
// The supported SSR browser client and server clients must share these options.
export function cookieOptions(config: { appOrigin: string }): CookieOptions {
  return {
    path: "/",
    httpOnly: false,
    secure: config.appOrigin.startsWith("https:"),
    sameSite: "lax",
  };
}
