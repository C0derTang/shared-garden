// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readMediaRequest } from "./http";
it("rejects cross-origin, missing origin, non-JSON and large control bodies", async () => {
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.test");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_synthetic",
  );
  for (const request of [
    new Request("https://app.example.test/api/media/intents", {
      method: "POST",
      headers: {
        origin: "https://other.example.test",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    new Request("https://app.example.test/api/media/intents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    new Request("https://app.example.test/api/media/intents", {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "content-type": "text/plain",
      },
      body: "{}",
    }),
    new Request("https://app.example.test/api/media/intents", {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        "content-type": "application/json",
      },
      body: '"' + "x".repeat(4096) + '"',
    }),
  ])
    await expect(readMediaRequest(request)).rejects.toBeDefined();
  vi.unstubAllEnvs();
});

it("uses the same canonical configured origin as the authentication flow", async () => {
  vi.stubEnv("APP_ORIGIN", " https://app.example.test/ ");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.test");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_synthetic",
  );
  const request = new Request("https://app.example.test/api/media/read", {
    method: "POST",
    headers: {
      origin: "https://app.example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({ mediaId: "11111111-1111-4111-8111-111111111111" }),
  });
  await expect(readMediaRequest(request)).resolves.toEqual({
    mediaId: "11111111-1111-4111-8111-111111111111",
  });
  vi.unstubAllEnvs();
});
