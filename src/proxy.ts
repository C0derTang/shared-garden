import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { createRequestClient, noStore, redirectTo } from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";

export async function proxy(request: NextRequest) {
  const mediaApi = request.nextUrl.pathname.startsWith("/api/media/");
  const config = getAuthConfig();
  if (!config)
    return mediaApi
      ? noStore(
          NextResponse.json({ error: "media_unavailable" }, { status: 503 }),
        )
      : redirectTo(null, "/auth/error?reason=setup");
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
      mediaApi
        ? NextResponse.json(
            {
              error:
                access.status === "signin"
                  ? "signin_required"
                  : access.status === "denied"
                    ? "media_not_available"
                    : "media_unavailable",
            },
            {
              status:
                access.status === "signin"
                  ? 401
                  : access.status === "denied"
                    ? 403
                    : 503,
            },
          )
        : redirectTo(config, `/auth/error?reason=${access.status}`),
    );
  const response = auth.finish(NextResponse.next({ request }));
  // Native same-origin forms must retain their Origin in WebKit. External
  // navigations still receive no referrer, and private media keeps its policy.
  if (!mediaApi) response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export const config = {
  matcher: [
    "/garden/:path*",
    "/api/media/:path*",
    "/memories/:path*",
    "/achievements/:path*",
    "/settings/:path*",
  ],
};
