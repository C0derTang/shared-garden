import "server-only";

type ServerConfigResult =
  | { status: "ready"; config: { supabaseSecretKey: string } }
  | { status: "missing" | "invalid" };

// Use only in privileged server operations after their authorization checks.
// Private media uses this only for server validation, private signing and cleanup.
export function getServerConfig(): ServerConfigResult {
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) return { status: "missing" };
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(key)) return { status: "invalid" };
  return { status: "ready", config: { supabaseSecretKey: key } };
}
