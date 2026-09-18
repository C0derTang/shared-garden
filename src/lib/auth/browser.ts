"use client";
import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE, cookieOptions } from "./cookies";
import { getPublicConfig } from "@/lib/config/public";

export function gardenBrowserClient() {
  const config = getPublicConfig();
  if (config.status !== "ready") return null;
  return createBrowserClient(
    config.config.supabaseUrl,
    config.config.supabasePublishableKey,
    {
      cookieOptions: {
        name: AUTH_COOKIE,
        ...cookieOptions({ appOrigin: window.location.origin }),
      },
    },
  );
}
