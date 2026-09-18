import { describe, expect, it } from "vitest";
import { parsePublicConfig } from "@/lib/config/public";

describe("public configuration boundary", () => {
  it("requires both public settings and fails closed when either is missing", () => {
    expect(parsePublicConfig({}).status).toBe("missing");
    expect(
      parsePublicConfig({ supabaseUrl: "https://garden.supabase.co" }).status,
    ).toBe("missing");
    expect(
      parsePublicConfig({ supabasePublishableKey: "sb_publishable_synthetic" })
        .status,
    ).toBe("missing");
  });

  it.each([
    "not a URL",
    "javascript:alert(1)",
    "http://garden.supabase.co",
    "https://name:password@garden.supabase.co",
    "https://garden.supabase.co?token=value",
    "https://garden.supabase.co/path",
    "https://garden.supabase.co/#secret",
  ])("rejects an unsafe service endpoint: %s", (supabaseUrl) => {
    expect(
      parsePublicConfig({
        supabaseUrl,
        supabasePublishableKey: "sb_publishable_synthetic",
      }).status,
    ).toBe("invalid");
  });

  it.each([
    "sb_secret_synthetic",
    "service_role",
    "eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "sb_publishable_",
    "sb_publishable_bad key",
  ])(
    "rejects non-publishable keys without echoing them: %s",
    (supabasePublishableKey) => {
      const result = parsePublicConfig({
        supabaseUrl: "https://garden.supabase.co",
        supabasePublishableKey,
      });
      expect(result.status).toBe("invalid");
      expect(JSON.stringify(result)).not.toContain(supabasePublishableKey);
    },
  );

  it("normalizes the public endpoint and returns only public fields", () => {
    const input = {
      supabaseUrl: " https://garden.supabase.co/ ",
      supabasePublishableKey: " sb_publishable_synthetic ",
      secret: "private-sentinel",
    };
    expect(parsePublicConfig(input)).toEqual({
      status: "ready",
      config: {
        supabaseUrl: "https://garden.supabase.co",
        supabasePublishableKey: "sb_publishable_synthetic",
      },
    });
  });

  it.each([
    "http://localhost:56321",
    "http://127.0.0.1:56321",
    "http://[::1]:56321",
  ])("allows loopback development: %s", (supabaseUrl) => {
    expect(
      parsePublicConfig({
        supabaseUrl,
        supabasePublishableKey: "sb_publishable_synthetic",
      }).status,
    ).toBe("ready");
  });
});
