// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
import { GET } from "@/app/auth/dev-sign-in/route";
import { getDevSignInConfig } from "@/lib/auth/dev-sign-in";

const origin = "http://localhost:3105";
const service = "http://127.0.0.1:56321";
const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "member1@example.test",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: {},
  identities: [],
  created_at: "2026-01-01T00:00:00Z",
};
const token = "abcdef123456";
function session() {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: user.id, exp: expires, role: "authenticated", amr: [{ method: "oauth" }] })).toString("base64url")}.synthetic-signature`;
  return {
    access_token: jwt,
    refresh_token: "rotatedToken",
    expires_in: 3600,
    expires_at: expires,
    token_type: "bearer",
    user,
  };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

let memberRows: unknown;
let tokenStatus: number;
let calls: { url: string; body: unknown }[];

function setGoodEnv() {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", service);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_synthetic");
}
const get = (query = `?token=${token}`) =>
  GET(new NextRequest(`${origin}/auth/dev-sign-in${query}`));

beforeEach(() => {
  setGoodEnv();
  memberRows = [{ member_id: 1, member_role: "owner" }];
  tokenStatus = 200;
  calls = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url === `${service}/auth/v1/token?grant_type=refresh_token`)
      return tokenStatus === 200
        ? json(session())
        : json({ error: "invalid_grant" }, tokenStatus);
    if (url === `${service}/auth/v1/user`) return json(user);
    if (url === `${service}/rest/v1/rpc/current_member`) return json(memberRows);
    throw new Error("Unexpected external call");
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("development sign-in gates", () => {
  it("is enabled only with development NODE_ENV and loopback origins", () => {
    expect(getDevSignInConfig()).toMatchObject({
      appOrigin: origin,
      supabaseUrl: service,
    });
  });

  it.each(["production", "test", ""])(
    "gate NODE_ENV=%j returns 404 without contacting Auth",
    async (value) => {
      vi.stubEnv("NODE_ENV", value);
      expect(getDevSignInConfig()).toBeNull();
      const response = await get();
      expect(response.status).toBe(404);
      expect(response.cookies.getAll()).toEqual([]);
      expect(calls).toEqual([]);
    },
  );

  it.each([
    "https://app.example.test",
    "http://app.example.test",
    "https://localhost:3105",
    "http://10.0.0.2:3105",
    "",
  ])("gate APP_ORIGIN=%j returns 404", async (value) => {
    vi.stubEnv("APP_ORIGIN", value);
    expect(getDevSignInConfig()).toBeNull();
    expect((await get()).status).toBe(404);
    expect(calls).toEqual([]);
  });

  it.each([
    "https://project.example.test",
    "http://project.example.test",
    "https://127.0.0.1:56321",
    "",
  ])("gate Supabase URL=%j returns 404", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", value);
    expect(getDevSignInConfig()).toBeNull();
    expect((await get()).status).toBe(404);
    expect(calls).toEqual([]);
  });
});

describe("development sign-in exchange", () => {
  it("exchanges one local token for a member session and goes home", async () => {
    const response = await get();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/`);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(calls[0]).toEqual({
      url: `${service}/auth/v1/token?grant_type=refresh_token`,
      body: { refresh_token: token },
    });
    const cookie = response.cookies.get("sg-auth");
    expect(cookie?.value).toMatch(/^base64-/);
    expect(cookie?.secure).toBe(false);
  });

  it.each(["", "?token=short", "?token=has-dash-1234",
    "?token=ABCDEF123456", `?token=${token}&token=${token}`])(
    "rejects malformed token %j without contacting Auth",
    async (query) => {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
      expect(response.cookies.get("sg-auth")).toBeUndefined();
    },
  );

  it("rejects a used or unknown token", async () => {
    tokenStatus = 400;
    const response = await get();
    expect(response.status).toBe(400);
    expect(response.cookies.get("sg-auth")?.value ?? "").toBe("");
  });

  it("clears the session when the account is not a garden member", async () => {
    memberRows = [];
    const response = await get();
    expect(response.status).toBe(400);
    expect(response.cookies.get("sg-auth")?.value).toBe("");
    expect(response.headers.get("location")).toBeNull();
  });
});
