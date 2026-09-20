import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("@/lib/achievements/actions", () => ({ readAchievements: vi.fn() }));
import { readAchievements } from "@/lib/achievements/actions";
import { AchievementsClient } from "./achievements-client";
import type { AchievementState } from "@/lib/achievements/model";
function fixture(): AchievementState {
  return {
    server_now: "2026-01-03T20:00:00Z", current_streak: 2,
    achievements: Array.from({ length: 26 }, (_, index) => ({
      achievement_id: `synthetic-${index}`, position: index + 1,
      title: `Milestone ${index + 1}`, target: 3, unit: "blooms",
      requirement: `Requirement ${index + 1}`, progress: index === 0 ? 3 : 1,
      earned_at: index === 0 ? "2026-01-02T20:00:00Z" : null,
    })),
  };
}
beforeEach(() => vi.mocked(readAchievements).mockReset());
it("shows an honest unavailable state, with retry and no invented progress", () => {
  render(<AchievementsClient initial={{ state: null, error: "Could not refresh" }} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh");
  expect(screen.getByRole("button", { name: "Refresh achievements" })).toBeVisible();
  expect(screen.queryByText("0 of 26 earned")).not.toBeInTheDocument();
});
it("keeps requirements out of the badge grid until each accessible badge is opened", async () => {
  const user = userEvent.setup();
  render(<AchievementsClient initial={{ state: fixture(), error: null }} />);
  expect(screen.getByText("1 of 26 earned")).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(26);
  expect(screen.queryByText("Requirement 1")).not.toBeInTheDocument();
  const first = screen.getByRole("button", { name: "Milestone 1, Earned, 3 of 3 blooms" });
  expect(first).toHaveAttribute("aria-expanded", "false");
  await user.click(first);
  expect(first).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Requirement 1")).toBeVisible();
  expect(screen.getByText("Jan 2, 2026")).toHaveAttribute("datetime", "2026-01-02T20:00:00Z");
  expect(screen.getByRole("progressbar", { name: "Milestone 1 progress" })).toHaveAttribute("value", "3");
  for (let n = 2; n <= 26; n++) {
    await user.click(screen.getByRole("button", { name: `Milestone ${n}, Growing, 1 of 3 blooms` }));
    expect(screen.getByText(`Requirement ${n}`)).toBeVisible();
    expect(screen.queryByText(`Requirement ${n - 1}`)).not.toBeInTheDocument();
  }
});
it("opens and closes details with the keyboard while retaining badge focus", async () => {
  const user = userEvent.setup();
  render(<AchievementsClient initial={{ state: fixture(), error: null }} />);
  const badge = screen.getByRole("button", { name: "Milestone 2, Growing, 1 of 3 blooms" });
  badge.focus();
  await user.keyboard("{Enter}");
  expect(screen.getByText("Requirement 2")).toBeVisible();
  await user.keyboard(" ");
  expect(screen.queryByText("Requirement 2")).not.toBeInTheDocument();
  expect(badge).toHaveFocus();
});
it("uses full authoritative titles and requirements for shortened badges", async () => {
  const state = fixture();
  state.achievements[0] = { ...state.achievements[0], achievement_id: "before-noon", title: "Both water every eligible live flower before noon", requirement: "Both water every plant in a nonempty 4 a.m. snapshot before Pacific noon. Moonflower, Peony and bloomed plants are excluded; new plants join the next day. Confirmed at rollover." };
  render(<AchievementsClient initial={{ state, error: null }} />);
  const badge = screen.getByRole("button", { name: /Both water every eligible live flower before noon, Earned/ });
  expect(within(badge).getByText("Before noon")).toBeVisible();
  await userEvent.click(badge);
  expect(screen.getByRole("heading", { name: "Both water every eligible live flower before noon" })).toBeVisible();
  expect(screen.getByText(state.achievements[0].requirement)).toBeVisible();
});
it.each([0, 26])("keeps the ordinary denominator and server awards when %i are earned", (count) => {
  const state = fixture();
  state.achievements.forEach((item, index) => { item.earned_at = index < count ? "2026-01-02T20:00:00Z" : null; item.progress = item.target; });
  render(<AchievementsClient initial={{ state, error: null }} />);
  expect(screen.getByText(`${count} of 26 earned`)).toBeVisible();
  expect(screen.getAllByRole("button", { name: new RegExp(`, ${count ? "Earned" : "Growing"},`) })).toHaveLength(26);
  expect(screen.queryByText(/private|final event/i)).not.toBeInTheDocument();
});
it("keeps newer progress, open details and server ordering through an older refresh and an error", async () => {
  const state = fixture();
  render(<AchievementsClient initial={{ state, error: null }} />);
  await userEvent.click(screen.getByRole("button", { name: "Milestone 2, Growing, 1 of 3 blooms" }));
  vi.mocked(readAchievements).mockResolvedValueOnce({ state: { ...state, server_now: "2026-01-02T20:00:00Z", achievements: state.achievements.map(item => ({ ...item, progress: 0 })) }, error: null });
  await userEvent.click(screen.getByRole("button", { name: "Refresh achievements" }));
  expect(screen.getByRole("button", { name: "Milestone 2, Growing, 1 of 3 blooms" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText("Requirement 2")).toBeVisible();
  vi.mocked(readAchievements).mockRejectedValueOnce(Error("offline"));
  fireEvent.focus(window);
  expect(await screen.findByRole("alert")).toHaveTextContent("Showing the last saved progress.");
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Milestone 1");
  expect(screen.getAllByRole("listitem")[25]).toHaveTextContent("Milestone 26");
  vi.mocked(readAchievements).mockResolvedValueOnce({ state: { ...state, server_now: "2026-01-04T20:00:00Z", current_streak: 3 }, error: null });
  await userEvent.click(screen.getByRole("button", { name: "Refresh achievements" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("3-day streak")).toBeVisible();
});
