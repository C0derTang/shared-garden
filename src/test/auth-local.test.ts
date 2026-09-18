// @vitest-environment node
/** Opt-in local Auth + Data API check. See decision 0008 for safe setup. */
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
import { proxy } from "@/proxy";
import { POST as signOut } from "@/app/auth/sign-out/route";

const statusPath = process.env.LOCAL_AUTH_STATUS_FILE;
it.skipIf(!statusPath)(
  "verifies real local Auth and membership, fails closed on revocation, and clears sign-out",
  async () => {
    const local = JSON.parse(readFileSync(statusPath!, "utf8"));
    // Refuse hosted endpoints, arbitrary containers and accidentally configured DBs.
    expect(local.API_URL).toBe("http://127.0.0.1:56621");
    expect(local.PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    const sql = (query: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "supabase_db_shared-garden-auth22",
          "psql",
          "-U",
          "supabase_admin",
          "-d",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
        ],
        { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    expect(sql("select count(*) from private.garden_members;").trim()).toBe(
      "0",
    );
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      sql(`select count(*) from auth.users where id = '${id}';`).trim(),
    ).toBe("0");
    const origin = "http://localhost:56629";
    vi.stubEnv("APP_ORIGIN", origin);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", local.API_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", local.PUBLISHABLE_KEY);
    try {
      sql(`begin;
      set local role postgres;
      select private.bootstrap_members('owner@example.test', 'member@example.test');
      reset role;
      set local role supabase_auth_admin;
      insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
      values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', 'owner@example.test', '{"provider":"google","providers":["google"]}', '{}');
      insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
      values ('${id}', 'local-auth-owner', 'google', '{"sub":"local-auth-owner","email":"owner@example.test","email_verified":true}', now(), now(), now());
      update auth.users set created_at = now(), updated_at = now(), encrypted_password = '', confirmation_token = '', recovery_token = '', email_change_token_new = '', email_change = '', email_confirmed_at = now() where id = '${id}';
      commit;`);
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        sub: id,
        aud: "authenticated",
        role: "authenticated",
        iat: now,
        exp: now + 3600,
        amr: [{ method: "oauth", timestamp: now }],
        is_anonymous: false,
      };
      const unsigned = `${Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
      const access_token = `${unsigned}.${createHmac("sha256", local.JWT_SECRET).update(unsigned).digest("base64url")}`;
      const identityResponse = await fetch(`${local.API_URL}/auth/v1/user`, {
        headers: {
          apikey: local.PUBLISHABLE_KEY,
          Authorization: `Bearer ${access_token}`,
        },
      });
      const identityResult = await identityResponse.json();
      expect({
        status: identityResponse.status,
        code: identityResult.code,
        message: identityResult.msg,
      }).toEqual({ status: 200, code: undefined, message: undefined });
      const session = {
        access_token,
        refresh_token: "synthetic-not-issued",
        token_type: "bearer",
        expires_at: now + 3600,
        expires_in: 3600,
        user: { id },
      };
      const cookie = `sg-auth=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
      const allowed = await proxy(
        new NextRequest(`${origin}/garden`, { headers: { cookie } }),
      );
      expect(allowed.headers.get("location")).toBeNull();
      expect(allowed.headers.get("x-middleware-next")).toBe("1");
      expect(allowed.headers.get("cache-control")).toContain("no-store");
      sql(
        "update private.garden_members set revoked_at = now() where member_id = 1;",
      );
      const denied = await proxy(
        new NextRequest(`${origin}/garden`, { headers: { cookie } }),
      );
      expect(denied.headers.get("location")).toBe(
        `${origin}/auth/error?reason=denied`,
      );
      const signedOut = await signOut(
        new NextRequest(`${origin}/auth/sign-out`, {
          method: "POST",
          headers: { cookie, origin },
        }),
      );
      expect(signedOut.cookies.get("sg-auth")?.value).toBe("");
      expect(signedOut.headers.get("location")).toBe(`${origin}/`);
    } finally {
      sql(
        `delete from private.garden_members; delete from auth.users where id = '${id}';`,
      );
      vi.unstubAllEnvs();
    }
    expect(sql("select count(*) from private.garden_members;").trim()).toBe(
      "0",
    );
  },
  20000,
);
