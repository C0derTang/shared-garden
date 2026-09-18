import type { NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { createRequestClient, redirectTo } from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return redirectTo(null, "/auth/error?reason=setup");
  const params = request.nextUrl.searchParams;
  if (params.has("error"))
    return redirectTo(config, "/auth/error?reason=cancelled");
  const codes = params.getAll("code");
  if (codes.length !== 1 || !codes[0] || codes[0].length > 4096)
    return redirectTo(config, "/auth/error?reason=callback");
  const auth = createRequestClient(request, config);
  try {
    const { error } = await auth.client.auth.exchangeCodeForSession(codes[0]);
    if (!error) {
      const access = await verifyMember(auth.client);
      return auth.finish(
        redirectTo(
          config,
          access.status === "allowed"
            ? "/garden"
            : `/auth/error?reason=${access.status}`,
        ),
      );
    }
  } catch {
    /* The public state never includes OAuth query values. */
  }
  auth.clearVerifier();
  return auth.finish(redirectTo(config, "/auth/error?reason=callback"));
}
