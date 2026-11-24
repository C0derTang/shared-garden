// @vitest-environment node
import { isValidElement, type ReactElement } from "react";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const api = vi.hoisted(() => ({
  requireMember: vi.fn(),
  loadMemories: vi.fn(),
  readAchievements: vi.fn(),
  loadSongs: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ requireMember: api.requireMember }));
vi.mock("@/lib/memories/actions", () => ({ loadMemories: api.loadMemories }));
vi.mock("@/lib/achievements/actions", () => ({ readAchievements: api.readAchievements }));
vi.mock("@/lib/music/collection-actions", () => ({ loadSongs: api.loadSongs }));
vi.mock("@/components/memories/memories-client", () => ({ MemoriesClient: () => null }));
vi.mock("@/components/achievements/achievements-client", () => ({ AchievementsClient: () => null }));
vi.mock("@/components/music/song-collection", () => ({ SongCollection: () => null }));
vi.mock("@/components/settings/settings-client", () => ({ SettingsClient: () => null }));
import { AchievementsClient } from "@/components/achievements/achievements-client";
import { MemoriesClient } from "@/components/memories/memories-client";
import { SongCollection } from "@/components/music/song-collection";
import { SettingsClient } from "@/components/settings/settings-client";
import LegacyPage from "./page";

const render = (panel?: string | string[]) =>
  LegacyPage({ searchParams: Promise.resolve({ panel }) }) as Promise<ReactElement<Record<string, unknown>> | null>;
beforeEach(() => {
  vi.clearAllMocks();
  api.requireMember.mockResolvedValue({ member: { member_id: 2 } });
  api.loadMemories.mockResolvedValue("memories");
  api.readAchievements.mockResolvedValue("achievements");
  api.loadSongs.mockResolvedValue("songs");
});

it.each([
  ["memories", MemoriesClient, { initial: "memories", memberId: 2 }],
  ["achievements", AchievementsClient, { initial: "achievements" }],
  ["songs", SongCollection, { initial: "songs", memberId: 2 }],
  ["settings", SettingsClient, {}],
] as const)("supplies the %s panel and reads only its own data", async (panel, component, props) => {
  const element = await render(panel);
  expect(isValidElement(element) && element.type).toBe(component);
  expect(element?.props).toEqual(props);
  const reads = { memories: api.loadMemories, achievements: api.readAchievements, songs: api.loadSongs };
  for (const [name, read] of Object.entries(reads))
    expect(read).toHaveBeenCalledTimes(name === panel ? 1 : 0);
});

it.each([undefined, "garden", "constructor", ["memories", "settings"]])("leaves the garden uncovered for panel %j", async (panel) => {
  expect(await render(panel)).toBeNull();
  expect(api.loadMemories).not.toHaveBeenCalled();
  expect(api.readAchievements).not.toHaveBeenCalled();
  expect(api.loadSongs).not.toHaveBeenCalled();
});

it("verifies membership before reading any panel data", async () => {
  api.requireMember.mockRejectedValue(new Error("redirect:/"));
  await expect(render("memories")).rejects.toThrow("redirect:/");
  expect(api.loadMemories).not.toHaveBeenCalled();
});
