// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createBrowserClient } from "@supabase/ssr";

vi.mock("server-only", () => ({}));
import { POST as start } from "@/app/auth/start/route";
import { GET as callback } from "@/app/auth/callback/route";
import { POST as signOut } from "@/app/auth/sign-out/route";
import { proxy } from "@/proxy";

const origin = "https://app.example.test";
const service = "https://backend.example.test";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "synthetic@example.test",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { role: "owner" },
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
const token = (expires: number) =>
  `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated", amr: [{ method: "oauth" }] })).toString("base64url")}.synthetic-signature`;
function session(expired = false) {
  const expires = Math.floor(Date.now() / 1000) + (expired ? -100 : 3600);
  return {
    access_token: token(expires),
    refresh_token: "synthetic-refresh",
    expires_in: 3600,
    expires_at: expires,
    token_type: "bearer",
    user,
  };
}
function cookie(expired = false) {
  return `sg-auth=base64-${Buffer.from(JSON.stringify(session(expired))).toString("base64url")}`;
}
function request(
  path: string,
  options: ConstructorParameters<typeof NextRequest>[1] = {},
) {
  return new NextRequest(`${origin}${path}`, options);
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let memberRows: unknown;
let userStatus: number;
let tokenStatus: number;
let logoutStatus: number;
let calls: { url: string; body: unknown; authorization: string | null }[];

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", service);
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_synthetic",
  );
  memberRows = [{ member_id: 1, member_role: "owner" }];
  userStatus = 200;
  tokenStatus = 200;
  logoutStatus = 204;
  calls = [];
  // Only the external Auth/Data API is replaced. Routes, SSR client, PKCE,
  // session encoding, cookie adapters and membership validation remain real.
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: new Headers(init?.headers).get("authorization"),
      });
      if (url.startsWith(`${service}/auth/v1/token`))
        return tokenStatus === 200
          ? json(session())
          : json(
              {
                error: "invalid_grant",
                error_description: "private-upstream-detail",
              },
              tokenStatus,
            );
      if (url === `${service}/auth/v1/user`)
        return userStatus === 200
          ? json(user)
          : json({ msg: "private-upstream-detail" }, userStatus);
      if (url === `${service}/rest/v1/rpc/current_member`)
        return json(memberRows);
      if (url.startsWith(`${service}/auth/v1/logout`))
        return logoutStatus === 204
          ? new Response(null, { status: 204 })
          : json({ msg: "private-upstream-detail" }, logoutStatus);
      throw new Error("Unexpected external call");
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function startCookies() {
  const response = await start(
    request("/auth/start", { method: "POST", headers: { origin } }),
  );
  return response.cookies
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

describe("Google sign-in boundaries", () => {
  it("starts PKCE with a fixed configured origin and secure verifier cookie", async () => {
    const response = await start(
      request(
        "/auth/start?next=https://evil.example&origin=https://evil.example",
        {
          method: "POST",
          headers: {
            origin,
            host: "evil.example",
            "x-forwarded-host": "evil.example",
          },
        },
      ),
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe(service);
    expect(location.pathname).toBe("/auth/v1/authorize");
    expect(location.searchParams.get("provider")).toBe("google");
    expect(location.searchParams.get("redirect_to")).toBe(
      `${origin}/auth/callback`,
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("s256");
    expect(response.cookies.get("sg-auth-code-verifier")?.value).toBeTruthy();
    expect(response.headers.get("set-cookie")).not.toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Secure/);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=lax/i);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each([undefined, "null", "https://evil.example"])(
    "rejects a cross-origin or missing-origin POST (%s)",
    async (source) => {
      const response = await start(
        request("/auth/start", {
          method: "POST",
          headers: source ? { origin: source } : {},
        }),
      );
      expect(response.status).toBe(403);
      expect(response.cookies.getAll()).toHaveLength(0);
    },
  );
  it.each([
    "",
    "https://app.example.test/path",
    "javascript:alert(1)",
    "https://name:pass@app.example.test",
    "http://app.example.test",
  ])("fails closed for invalid/missing app origin %s", async (value) => {
    vi.stubEnv("APP_ORIGIN", value);
    const response = await start(
      request("/auth/start", {
        method: "POST",
        headers: { origin, host: "evil.example" },
      }),
    );
    expect(response.headers.get("location")).toBe("/auth/error?reason=setup");
  });
  it("keeps public setup failures free of configuration values", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_secret_private-marker",
    );
    const response = await start(
      request("/auth/start", { method: "POST", headers: { origin } }),
    );
    expect(response.headers.get("location")).toBe("/auth/error?reason=setup");
    expect(await response.text()).not.toContain("private-marker");
  });
  it("exchanges the code, verifies identity and membership, and carries cookies to a bounded destination", async () => {
    const verifier = await startCookies();
    const response = await callback(
      request("/auth/callback?code=synthetic-code&next=//evil.example", {
        headers: {
          cookie: verifier,
          host: "evil.example",
          "x-forwarded-host": "evil.example",
        },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/garden`);
    expect(response.cookies.get("sg-auth")?.value).toBeTruthy();
    expect(response.cookies.get("sg-auth-code-verifier")?.value).toBe("");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(calls.map(({ url }) => url)).toEqual([
      `${service}/auth/v1/token?grant_type=pkce`,
      `${service}/auth/v1/user`,
      `${service}/rest/v1/rpc/current_member`,
    ]);
    expect(calls[0].body).toMatchObject({ auth_code: "synthetic-code" });
    expect(calls[2].authorization).toMatch(/^Bearer /);
  });
  it.each([
    "?error=access_denied&error_description=private-marker",
    "",
    "?code=",
    "?code=a&code=b",
  ])(
    "handles cancellation or missing/ambiguous code safely (%s)",
    async (query) => {
      const response = await callback(request(`/auth/callback${query}`));
      expect(response.headers.get("location")).toMatch(
        /^https:\/\/app\.example\.test\/auth\/error\?reason=(cancelled|callback)$/,
      );
      expect(response.headers.get("location")).not.toContain("private-marker");
      expect(calls).toHaveLength(0);
    },
  );
  it("hands the same session to the supported browser client for future Realtime", async () => {
    const verifier = await startCookies();
    const response = await callback(
      request("/auth/callback?code=synthetic-code", {
        headers: { cookie: verifier },
      }),
    );
    expect(response.cookies.get("sg-auth")?.httpOnly).not.toBe(true);
    const browser = createBrowserClient(service, "sb_publishable_synthetic", {
      isSingleton: false,
      cookieOptions: {
        name: "sg-auth",
        path: "/",
        sameSite: "lax",
        secure: true,
        httpOnly: false,
      },
      cookies: { getAll: () => response.cookies.getAll(), setAll() {} },
    });
    const { data, error } = await browser.auth.getUser();
    expect(error).toBeNull();
    expect(data.user?.id).toBe(user.id);
  });
  it("denies a successful OAuth identity that has no database membership", async () => {
    memberRows = [];
    const verifier = await startCookies();
    const response = await callback(
      request("/auth/callback?code=synthetic-code", {
        headers: { cookie: verifier },
      }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=denied`,
    );
    expect(response.cookies.get("sg-auth")?.value).toBeTruthy();
  });
  it("fails closed on a Data API error without rendering upstream details", async () => {
    const serviceFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/rest/v1/")
        ? Promise.resolve(json({ message: "PRIVATE_DATABASE_DETAIL" }, 403))
        : serviceFetch(input, init),
    );
    const response = await proxy(
      request("/garden", { headers: { cookie: cookie() } }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=unavailable`,
    );
    expect(await response.text()).not.toContain("PRIVATE_DATABASE_DETAIL");
  });
  it("rejects an invalid authorization code and preserves verifier removal", async () => {
    const verifier = await startCookies();
    tokenStatus = 400;
    const response = await callback(
      request("/auth/callback?code=bad", { headers: { cookie: verifier } }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=callback`,
    );
    expect(response.cookies.get("sg-auth-code-verifier")?.value).toBe("");
  });
});

describe("protected destination", () => {
  it("redirects anonymous users without checking membership", async () => {
    const response = await proxy(request("/garden"));
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=signin`,
    );
    expect(calls).toHaveLength(0);
  });
  it.each([
    [],
    null,
    [{ member_id: 3, member_role: "owner" }],
    [{ member_id: 1, member_role: "member" }],
    [
      { member_id: 1, member_role: "owner" },
      { member_id: 2, member_role: "member" },
    ],
  ])(
    "denies missing or malformed membership despite editable owner metadata",
    async (rows) => {
      memberRows = rows;
      const response = await proxy(
        request("/garden", { headers: { cookie: cookie() } }),
      );
      expect(response.headers.get("location")).toBe(
        `${origin}/auth/error?reason=denied`,
      );
      expect(response.headers.get("x-middleware-next")).toBeNull();
    },
  );
  it("does not trust a locally present session when Auth rejects it", async () => {
    userStatus = 401;
    const response = await proxy(
      request("/garden", { headers: { cookie: cookie() } }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=signin`,
    );
    expect(calls.some(({ url }) => url.includes("current_member"))).toBe(false);
  });
  it.each([1, 2])(
    "allows verified member %s with private no-store responses",
    async (id) => {
      memberRows = [
        { member_id: id, member_role: id === 1 ? "owner" : "member" },
      ];
      const response = await proxy(
        request("/garden", { headers: { cookie: cookie() } }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("cache-control")).toContain("no-store");
    },
  );
  it.each(["/garden", "/api/media/finalize"])(
    "refreshes expired cookies for downstream %s and the browser",
    async (path) => {
      const response = await proxy(
        request(path, { headers: { cookie: cookie(true) } }),
      );
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.cookies.get("sg-auth")?.value).toBeTruthy();
      expect(response.headers.get("x-middleware-request-cookie")).toContain(
        response.cookies.get("sg-auth")!.value,
      );
      expect(calls[0].url).toBe(
        `${service}/auth/v1/token?grant_type=refresh_token`,
      );
    },
  );
  it("carries refreshed cookies even when membership denies", async () => {
    memberRows = [];
    const response = await proxy(
      request("/garden", { headers: { cookie: cookie(true) } }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=denied`,
    );
    expect(response.cookies.get("sg-auth")?.value).toBeTruthy();
  });
  it("fails closed when refresh is rejected", async () => {
    tokenStatus = 400;
    const response = await proxy(
      request("/garden", { headers: { cookie: cookie(true) } }),
    );
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=signin`,
    );
    expect(response.cookies.get("sg-auth")?.value).toBe("");
  });
});

describe("sign out", () => {
  it("revokes this session and clears its cookie chunks without touching unrelated cookies", async () => {
    const response = await signOut(
      request("/auth/sign-out", {
        method: "POST",
        headers: {
          origin,
          cookie: `${cookie()}; unrelated=keep; sg-auth.9=stale; sg-auth-flow-synthetic-code-verifier=stale`,
        },
      }),
    );
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.status).toBe(303);
    expect(response.cookies.get("sg-auth")?.value).toBe("");
    expect(response.cookies.get("sg-auth.9")?.value).toBe("");
    expect(
      response.cookies.get("sg-auth-flow-synthetic-code-verifier")?.value,
    ).toBe("");
    expect(response.cookies.get("unrelated")).toBeUndefined();
    expect(
      calls.some(({ url }) => url === `${service}/auth/v1/logout?scope=local`),
    ).toBe(true);
  });
  it("clears local credentials and explains incomplete revocation on service failure", async () => {
    logoutStatus = 500;
    const response = await signOut(
      request("/auth/sign-out", {
        method: "POST",
        headers: { origin, cookie: cookie() },
      }),
    );
    expect(response.cookies.get("sg-auth")?.value).toBe("");
    expect(response.headers.get("location")).toBe(
      `${origin}/auth/error?reason=signout`,
    );
  });
  it("rejects cross-origin sign out without clearing cookies", async () => {
    const response = await signOut(
      request("/auth/sign-out", {
        method: "POST",
        headers: { origin: "https://evil.example", cookie: cookie() },
      }),
    );
    expect(response.status).toBe(403);
    expect(response.cookies.getAll()).toHaveLength(0);
  });
});
it("rejects unavailable Server Actions in place so their drafts survive", async () => {
  userStatus = 503;
  const response = await proxy(
    request("/garden", {
      method: "POST",
      headers: { cookie: cookie(), "next-action": "synthetic-action" },
    }),
  );
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.text()).not.toContain("private-upstream-detail");
});
it("a forged action header cannot bypass membership denial", async () => {
  memberRows = [];
  const response = await proxy(
    request("/garden", {
      method: "POST",
      headers: { cookie: cookie(), "next-action": "forged" },
    }),
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    `${origin}/auth/error?reason=denied`,
  );
});

describe("private media proxy", () => {
  it("returns private JSON for anonymous media requests", async () => {
    const response = await proxy(request("/api/media/read"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signin_required" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("location")).toBeNull();
  });
  it("refreshes cookies on denied media requests and returns generic JSON", async () => {
    memberRows = [];
    const response = await proxy(
      request("/api/media/finalize", { headers: { cookie: cookie(true) } }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "media_not_available" });
    expect(response.cookies.get("sg-auth")?.value).toBeTruthy();
    expect(response.headers.get("cache-control")).toContain("private");
  });
});
