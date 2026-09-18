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
  let failed: boolean;
  try {
    const { error } = await auth.client.auth.signOut({ scope: "local" });
    failed = !!error;
  } catch {
    failed = true;
  }
  auth.clearSession();
  return auth.finish(
    redirectTo(config, failed ? "/auth/error?reason=signout" : "/"),
  );
}
