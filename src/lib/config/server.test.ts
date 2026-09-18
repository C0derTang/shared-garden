import { afterEach, describe, expect, it, vi } from "vitest";

// Next.js enforces this marker at compile time; Vitest runs outside its compiler.
vi.mock("server-only", () => ({}));
import { getServerConfig } from "@/lib/config/server";

afterEach(() => vi.unstubAllEnvs());

describe("server configuration", () => {
  it("fails closed when the server credential is absent", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(getServerConfig()).toEqual({ status: "missing" });
  });
  it("rejects a publishable key as a server credential without echoing it", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_publishable_synthetic");
    expect(getServerConfig()).toEqual({ status: "invalid" });
  });
  it("returns a modern secret key only through the server boundary", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", " sb_secret_synthetic ");
    expect(getServerConfig()).toEqual({
      status: "ready",
      config: { supabaseSecretKey: "sb_secret_synthetic" },
    });
  });
});
