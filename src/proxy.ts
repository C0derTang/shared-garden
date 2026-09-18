import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { createRequestClient, redirectTo } from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";

export async function proxy(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return redirectTo(null, "/auth/error?reason=setup");
  const auth = createRequestClient(request, config);
  const access = await verifyMember(auth.client);
  // A transient action failure must reject in place so an open draft survives.
  // The action still independently authorizes if the proxy is bypassed.
  if (
    access.status === "unavailable" &&
    request.method === "POST" &&
    !request.nextUrl.pathname.startsWith("/api/media/") &&
    request.headers.has("next-action")
  )
    return auth.finish(
      new NextResponse("Garden temporarily unavailable", { status: 503 }),
    );
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
