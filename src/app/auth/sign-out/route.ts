import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import {
  createRequestClient,
  noStore,
  redirectTo,
  sameOriginPost,
} from "@/lib/auth/client";

export async function POST(request: NextRequest) {
  const config = getAuthConfig();
  if (!config) return redirectTo(null, "/");
  if (!sameOriginPost(request, config))
    return noStore(
      new NextResponse("Please return to the garden and try again.", {
        status: 403,
      }),
    );
  const auth = createRequestClient(request, config);
  try {
    await auth.client.auth.signOut({ scope: "local" });
  } catch {
    /* The browser session is cleared below either way. */
  }
  auth.clearSession();
  return auth.finish(redirectTo(config, "/"));
}
