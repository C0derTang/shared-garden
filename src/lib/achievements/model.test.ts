import { expect, it } from "vitest";
import { parseAchievements } from "./model";
it("rejects incomplete, duplicate, and out-of-range progress instead of showing false completion", () => {
  expect(() => parseAchievements({ achievements: [] })).toThrow();
  expect(() => parseAchievements(null)).toThrow();
});
it("parses a complete snapshot but rejects duplicate and unbounded values", () => {
  const state = {
    server_now: "2026-01-01T20:00:00Z",
    current_streak: 0,
    achievements: Array.from({ length: 26 }, (_, i) => ({
      achievement_id: `id-${i}`,
      position: i + 1,
      title: "Title",
      target: 3,
      unit: "days",
      requirement: "Requirement",
      progress: 2,
      earned_at: null,
    })),
  };
  expect(parseAchievements(state).achievements).toHaveLength(26);
  expect(() =>
    parseAchievements({
      ...state,
      achievements: state.achievements.map((a) => ({
        ...a,
        achievement_id: "duplicate",
      })),
    }),
  ).toThrow();
  expect(() =>
    parseAchievements({
      ...state,
      achievements: state.achievements.map((a) => ({ ...a, progress: 4 })),
    }),
  ).toThrow();
});
