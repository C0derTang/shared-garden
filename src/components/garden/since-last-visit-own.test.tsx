vi.mock("@/lib/settings/actions", () => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/peony/actions", () => ({ readPeony: vi.fn(), mutatePeony: vi.fn() }));
const { refreshGarden, mutateGarden, loadFlowerHistory, readAchievements } = vi.hoisted(() => ({
  refreshGarden: vi.fn(),
  mutateGarden: vi.fn(),
  loadFlowerHistory: vi.fn(),
  readAchievements: vi.fn(),
}));
vi.mock("@/lib/garden/actions", () => ({ refreshGarden, mutateGarden, loadFlowerHistory }));
vi.mock("@/lib/achievements/actions", () => ({ readAchievements }));
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { gardenFixture } from "@/test/garden-fixture";
import type { AchievementResult } from "@/lib/achievements/model";
import type { GardenState, Plant } from "@/lib/garden/model";
import { publishBadges, snapshotKey, takeSnapshot } from "@/lib/garden/since-last-visit";
import { GardenClient } from "./garden-client";

function achievements(ids: [string, string][]): AchievementResult {
  return {
    error: null,
    state: {
      server_now: "2026-09-18T17:00:00Z",
      current_streak: 0,
      achievements: ids.map(([id, title], index) => ({
        achievement_id: id, position: index + 1, title, target: 1, unit: "", requirement: "", progress: 1, earned_at: "2026-09-18T17:00:00Z",
      })),
    },
  };
}
function garden() {
  const state = gardenFixture();
  const base = state.plants[0];
  const rose: Plant = { ...base, flower: { ...base.flower, id: "rose-1", type_key: "rose", spot: 2, is_initial: false, growth_units: 4 }, entries: [] };
  state.plants.push(rose);
  return state;
}
const key = snapshotKey(gardenFixture());

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  publishBadges({ key: null, unread: 0 });
});

it("absorbs blooms, unlocks and badges from your own action and still shows partner care", async () => {
  const user = userEvent.setup();
  const initial = garden();
  localStorage.setItem(key, JSON.stringify(takeSnapshot(initial, [{ id: "first-seed", title: "First seed" }], null)));
  readAchievements.mockResolvedValue(achievements([["first-seed", "First seed"]]));
  refreshGarden.mockResolvedValue({ state: initial, error: null });
  render(<GardenClient initial={{ state: initial, error: null }} guideEnabled={false} />);
  await waitFor(() => expect(readAchievements).toHaveBeenCalledTimes(1));

  // Your check-in returns a garden where a bloom, an unlock and a badge also
  // landed (for example a settlement run by your own request), and where your
  // partner has cared for the Rose.
  const after: GardenState = structuredClone(initial);
  after.server_now = "2026-09-18T17:05:00Z";
  after.plants[0].member1_submitted = true;
  after.plants[1].flower.first_bloom_at = "2026-09-18T17:05:00Z";
  after.plants[1].member2_submitted = true;
  after.unlocks.push({ type_key: "daisy", unlocked_at: "2026-09-18T17:05:00Z" });
  mutateGarden.mockResolvedValue({ state: after, saved: true, error: null });
  refreshGarden.mockResolvedValue({ state: after, error: null });
  readAchievements.mockResolvedValue(achievements([["first-seed", "First seed"], ["streak-3", "Three-day streak"]]));

  await user.click(screen.getByRole("button", { name: /Cactus, spot 1/ }));
  await user.click(screen.getByRole("button", { name: "I’m here · Check in" }));
  await waitFor(() => expect(mutateGarden).toHaveBeenCalled());
  // Nothing pops up behind the open sheet.
  expect(document.querySelector("[data-since-last-visit]")).toBeNull();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

  // The badge read triggered by your own action lands silently too.
  await waitFor(() => expect(readAchievements).toHaveBeenCalledTimes(2), { timeout: 3000 });
  await act(async () => {});
  const card = await screen.findByRole("region", { name: "While you were away" });
  expect(within(card).getByText("Your partner cared for Rose")).toBeInTheDocument();
  expect(within(card).queryByText(/bloomed|unlocked|New badge/)).not.toBeInTheDocument();
  const stored = JSON.parse(localStorage.getItem(key)!);
  expect(stored.blooms).toContain("rose-1");
  expect(stored.unlocks).toContain("daisy");
  expect(stored.badges).toContain("streak-3");
});
