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
import GardenPage from "@/app/(member)/garden/page";

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

import SettingsPage from "@/app/(member)/settings/page";
it("guards the separate Settings page even when the proxy is bypassed", async () => {
  await expect(SettingsPage()).rejects.toThrow(/^redirect:\/$/);
});

import MemoriesPage from "@/app/(member)/memories/page";
import AchievementsPage from "@/app/(member)/achievements/page";
import SongsPage from "@/app/(member)/garden/songs/page";
import MemberLayout from "@/app/(member)/layout";
it.each([MemoriesPage, AchievementsPage, SongsPage])("guards every destination before returning private panel content", async (page) => {
  await expect(page()).rejects.toThrow(/^redirect:\/$/);
});
it("guards direct route layout requests before constructing the persistent garden", async () => {
  await expect(MemberLayout({ children: null })).rejects.toThrow(/^redirect:\/$/);
});
