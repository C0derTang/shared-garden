import { NextResponse, type NextRequest } from "next/server";
import {
  createRequestClient,
  noStore,
  redirectTo,
} from "@/lib/auth/client";
import { verifyMember } from "@/lib/auth/member";
import { DEV_SIGN_IN_TOKEN, getDevSignInConfig } from "@/lib/auth/dev-sign-in";

// Development-only: exchanges a local refresh token printed by
// `npm run dev:signin` for a session cookie. See src/lib/auth/dev-sign-in.ts.
// Outside development with loopback origins it behaves as a missing page.
export async function GET(request: NextRequest) {
  const config = getDevSignInConfig();
  if (!config) return noStore(new NextResponse(null, { status: 404 }));
  const tokens = request.nextUrl.searchParams.getAll("token");
  const auth = createRequestClient(request, config);
  if (tokens.length === 1 && DEV_SIGN_IN_TOKEN.test(tokens[0])) {
    try {
      const { error } = await auth.client.auth.refreshSession({
        refresh_token: tokens[0],
      });
      // Only a bound, unrevoked garden member may keep the session.
      if (!error && (await verifyMember(auth.client)).status === "allowed")
        return auth.finish(redirectTo(config, "/"));
    } catch {
      /* Fall through to the uniform failure below. */
    }
  }
  auth.clearSession();
  return auth.finish(
    new NextResponse(
      "Development sign-in failed. Run npm run dev:signin again for a new link.",
      { status: 400 },
    ),
  );
}
