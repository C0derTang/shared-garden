import type { NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { createRequestClient, redirectTo } from "@/lib/auth/client";

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return redirectTo(null, "/");
  const params = request.nextUrl.searchParams;
  if (params.has("error"))
    return redirectTo(config, "/");
  const codes = params.getAll("code");
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096)
    return redirectTo(config, "/");
  const auth = createRequestClient(request, config);
  try {
    const { error } = await auth.client.auth.exchangeCodeForSession(codes[0]);
    // Every outcome lands home; the homepage itself verifies membership and
    // shows non-members only the Log in control.
    if (!error) return auth.finish(redirectTo(config, "/"));
  } catch {
    /* The public state never includes OAuth query values. */
  }
  auth.clearVerifier();
  return auth.finish(redirectTo(config, "/"));
}
