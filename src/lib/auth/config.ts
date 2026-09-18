import "server-only";
import { getPublicConfig } from "@/lib/config/public";

export type AuthConfig = {
  appOrigin: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
};

export function getAuthConfig(): AuthConfig | null {
  const publicConfig = getPublicConfig();
  if (publicConfig.status !== "ready") return null;
  try {
    const url = new URL(process.env.APP_ORIGIN?.trim() ?? "");
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return { ...publicConfig.config, appOrigin: url.origin };
  } catch {
    return null;
  }
}
