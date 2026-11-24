// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [] }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
import GardenPage from "@/app/garden/page";

beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", "https://app.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://backend.example.test");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_synthetic",
  );
});
afterEach(() => vi.unstubAllEnvs());
it("rechecks authorization in the page even if the proxy is bypassed", async () => {
  await expect(GardenPage()).rejects.toThrow(
    /^redirect:\/$/,
  );
});
it("never renders a member shell without complete configuration", async () => {
  vi.stubEnv("APP_ORIGIN", "");
  await expect(GardenPage()).rejects.toThrow(
    /^redirect:\/$/,
  );
});
import ErrorPage from "@/app/auth/error/page";
it("sends old auth error links home without rendering a page", () => {
  expect(() => ErrorPage()).toThrow(/^redirect:\/$/);
});

import LegacyPage from "@/app/legacy/page";
import MemberLayout from "@/app/legacy/layout";
it.each([undefined, "memories", "achievements", "settings", "songs"])("guards the legacy page with panel %s before returning private panel content", async (panel) => {
  await expect(LegacyPage({ searchParams: Promise.resolve({ panel }) })).rejects.toThrow(/^redirect:\/$/);
});
it("guards direct legacy layout requests before constructing the persistent garden", async () => {
  await expect(MemberLayout({ children: null })).rejects.toThrow(/^redirect:\/$/);
});
