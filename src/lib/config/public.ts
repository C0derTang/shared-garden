type PublicEnvironment = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
};

export type PublicConfigResult =
  | {
      status: "ready";
      config: { supabaseUrl: string; supabasePublishableKey: string };
    }
  | { status: "missing" | "invalid" };

export function parsePublicConfig(
  input: PublicEnvironment,
): PublicConfigResult {
  const url = input.supabaseUrl?.trim();
  const key = input.supabasePublishableKey?.trim();
  if (!url || !key) return { status: "missing" };

  try {
    const endpoint = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(
      endpoint.hostname,
    );
    const safeProtocol =
      endpoint.protocol === "https:" ||
      (local && endpoint.protocol === "http:");
    if (
      !safeProtocol ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname !== "/" ||
      !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
    ) {
      return { status: "invalid" };
    }
    return {
      status: "ready",
      config: { supabaseUrl: endpoint.origin, supabasePublishableKey: key },
    };
  } catch {
    return { status: "invalid" };
  }
}

export function getPublicConfig(): PublicConfigResult {
  // Explicit references are required for Next.js public environment inlining.
  return parsePublicConfig({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}
