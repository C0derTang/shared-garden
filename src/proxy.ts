import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import {
  AUTH_COOKIE,
  createRequestClient,
  noStore,
  redirectTo,
} from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/") return refreshHome(request);
  const musicApi = request.nextUrl.pathname.startsWith("/api/music/");
  const mediaApi = request.nextUrl.pathname.startsWith("/api/media/");
  const config = getAuthConfig();
  if (!config)
    return (mediaApi || musicApi)
      ? noStore(
          NextResponse.json({ error: musicApi ? "unavailable" : "media_unavailable" }, { status: 503 }),
        )
      : redirectTo(null, "/");
  const auth = createRequestClient(request, config);
  const access = await verifyMember(auth.client);
  // A transient action failure must reject in place so an open draft survives.
  // The action still independently authorizes if the proxy is bypassed.
  if (
    access.status === "unavailable" &&
    request.method === "POST" &&
    !mediaApi && !musicApi &&
    request.headers.has("next-action")
  )
    return auth.finish(
      new NextResponse("Garden temporarily unavailable", { status: 503 }),
    );
  if (access.status !== "allowed")
    return auth.finish(
      (mediaApi || musicApi)
        ? NextResponse.json(
            {
              error:
                musicApi ? "unavailable" : access.status === "signin"
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
        : redirectTo(config, "/"),
    );
  const response = auth.finish(NextResponse.next({ request }));
  // Native same-origin forms must retain their Origin in WebKit. External
  // navigations still receive no referrer, and private media keeps its policy.
  if (!mediaApi && !musicApi) response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

// The public home page shows members their own entries. Server Components
// cannot write cookies, so an expired session is refreshed here and the
// rotated tokens reach both the render and the browser. Otherwise the render
// would rotate the refresh token without saving it, and the next protected
// request would replay the old one. Home never redirects: visitors, outsiders
// and failures simply render the public view.
async function refreshHome(request: NextRequest) {
  const config = getAuthConfig();
  const hasSession = request.cookies
    .getAll()
    .some(
      ({ name }) => name === AUTH_COOKIE || name.startsWith(`${AUTH_COOKIE}.`),
    );
  if (!config || !hasSession) {
    const response = noStore(NextResponse.next());
    response.headers.set("Referrer-Policy", "same-origin");
    return response;
  }
  const auth = createRequestClient(request, config);
  try {
    await auth.client.auth.getUser();
  } catch {
    // The page re-verifies membership itself and falls back to the public view.
  }
  const response = auth.finish(NextResponse.next({ request }));
  // Keep the native sign-in form's same-origin Origin header (see below).
  response.headers.set("Referrer-Policy", "same-origin");
  return response;
}

export const config = {
  matcher: [
    "/",
    "/garden/:path*",
    "/api/media/:path*",
    "/api/music/:path*",
    "/memories/:path*",
    "/achievements/:path*",
    "/settings/:path*",
  ],
};
