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
  if (!config) return redirectTo(null, "/auth/error?reason=setup");
  if (!sameOriginPost(request, config))
    return noStore(
      new NextResponse("Please return to the garden and try again.", {
        status: 403,
      }),
    );
  const auth = createRequestClient(request, config);
  try {
    const { data, error } = await auth.client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${config.appOrigin}/auth/callback`,
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account" },
      },
    });
    if (!error && data.url) {
      const destination = new URL(data.url);
      if (
        destination.origin === config.supabaseUrl &&
        destination.pathname === "/auth/v1/authorize"
      ) {
        return auth.finish(
          new NextResponse(null, {
            status: 303,
            headers: { Location: destination.href },
          }),
        );
      }
    }
  } catch {
    /* Never render upstream error messages or configuration values. */
  }
  return auth.finish(redirectTo(config, "/auth/error?reason=unavailable"));
}
