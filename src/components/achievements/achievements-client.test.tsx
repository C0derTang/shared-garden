import { expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("@/lib/achievements/actions", () => ({ readAchievements: vi.fn() }));
import { AchievementsClient } from "./achievements-client";
it("shows an honest unavailable state, with retry and no invented progress", () => {
  render(
    <AchievementsClient
      initial={{ state: null, error: "Could not refresh" }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh");
  expect(
    screen.getByRole("button", { name: "Refresh achievements" }),
  ).toBeVisible();
  expect(screen.queryByText("0 of 26 earned")).not.toBeInTheDocument();
});
it("renders all 26 distinct requirements, earned dates and bounded accessible progress", () => {
  const achievements = Array.from({ length: 26 }, (_, index) => ({
    achievement_id: `synthetic-${index}`,
    position: index + 1,
    title: `Milestone ${index + 1}`,
    target: 3,
    unit: "blooms",
    requirement: `Requirement ${index + 1}`,
    progress: index === 0 ? 3 : 1,
    earned_at: index === 0 ? "2026-01-02T20:00:00Z" : null,
  }));
  render(
    <AchievementsClient
      initial={{
        state: {
          server_now: "2026-01-03T20:00:00Z",
          current_streak: 2,
          achievements,
        },
        error: null,
      }}
    />,
  );
  expect(screen.getByText("1 of 26 earned")).toBeVisible();
  expect(screen.getAllByRole("listitem")).toHaveLength(26);
  expect(screen.getAllByRole("progressbar")).toHaveLength(27);
  expect(
    screen.getByRole("progressbar", { name: "Milestone 1 progress" }),
  ).toHaveAttribute("value", "3");
  expect(screen.getByText("Jan 2, 2026")).toHaveAttribute(
    "datetime",
    "2026-01-02T20:00:00Z",
  );
  expect(screen.getByText("Requirement 26")).toBeVisible();
});
it("keeps the ordinary completion denominator exactly 26", () => {
  const achievements = Array.from({ length: 26 }, (_, index) => ({
    achievement_id: `synthetic-${index}`,
    position: index + 1,
    title: `Milestone ${index + 1}`,
    target: 1,
    unit: "blooms",
    requirement: "Synthetic",
    progress: 1,
    earned_at: "2026-01-02T20:00:00Z",
  }));
  render(
    <AchievementsClient
      initial={{
        state: {
          server_now: "2026-01-03T20:00:00Z",
          current_streak: 0,
          achievements,
        },
        error: null,
      }}
    />,
  );
  expect(screen.getByText("26 of 26 earned")).toBeVisible();
  expect(
    screen.getByText("All 26 milestones earned. Your garden keeps growing."),
  ).toBeVisible();
});
