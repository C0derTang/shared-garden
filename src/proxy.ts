import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { createRequestClient, redirectTo } from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";

export async function proxy(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return redirectTo(null, "/auth/error?reason=setup");
  const auth = createRequestClient(request, config);
  const access = await verifyMember(auth.client);
  if (access.status !== "allowed")
    return auth.finish(
      redirectTo(config, `/auth/error?reason=${access.status}`),
    );
  return auth.finish(NextResponse.next({ request }));
}

export const config = {
  matcher: [
    "/garden/:path*",
    "/memories/:path*",
    "/achievements/:path*",
    "/settings/:path*",
  ],
};
