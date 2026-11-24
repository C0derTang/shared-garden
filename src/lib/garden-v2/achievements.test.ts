import { expect, it } from "vitest";
import { parseAchievementsV2, parseDayAwardsV2, V2_ACHIEVEMENT_COUNT } from "./achievements";

function achievement(position: number, earned = false) {
  return {
    achievement_id: `a-${position}`,
    position,
    title: `Achievement ${position}`,
    target: 3,
    unit: "days",
    requirement: "Synthetic requirement.",
    progress: earned ? 3 : 1,
    earned_at: earned ? "2026-11-02T18:00:00Z" : null,
    earned_day: earned ? "2026-11-02" : null,
  };
}
const state = () => ({
  server_now: "2026-11-02T18:00:00Z",
  garden_day: "2026-11-02",
  current_streak: 2,
  achievements: Array.from({ length: V2_ACHIEVEMENT_COUNT }, (_, i) => achievement(V2_ACHIEVEMENT_COUNT - i, i === 0)),
});

it("parses the 25 new-garden achievements in position order with earned days", () => {
  const parsed = parseAchievementsV2(state());
  expect(parsed.achievements.map((a) => a.position)).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  expect(parsed.achievements[24]).toMatchObject({
    earned_at: "2026-11-02T18:00:00Z",
    earned_day: "2026-11-02",
  });
  expect(parsed.garden_day).toBe("2026-11-02");
});

it("rejects malformed achievement state", () => {
  const cases: ((s: ReturnType<typeof state>) => void)[] = [
    (s) => s.achievements.pop(),
    (s) => (s.achievements[0].earned_day = null),
    (s) => (s.achievements[1].earned_day = "2026-11-02"),
    (s) => (s.achievements[0].earned_day = "2026-02-30"),
    (s) => (s.achievements[1].progress = 4),
    (s) => (s.achievements[1].position = s.achievements[2].position),
    (s) => (s.achievements[1].achievement_id = s.achievements[2].achievement_id),
    (s) => (s.garden_day = "today"),
    (s) => (s.current_streak = -1),
  ];
  for (const mutate of cases) {
    const value = state();
    mutate(value);
    expect(() => parseAchievementsV2(value)).toThrow();
  }
  expect(() => parseAchievementsV2(null)).toThrow();
});

it("parses awards for a garden day and keeps earned consistent with the list", () => {
  const award = {
    achievement_id: "first-seed",
    title: "First seed planted",
    earned_at: "2026-11-02T18:00:00Z",
    earned_day: "2026-11-02",
  };
  const base = {
    server_now: "2026-11-02T18:00:00Z",
    garden_day: "2026-11-02",
    day: "2026-11-02",
  };
  expect(parseDayAwardsV2({ ...base, earned: true, awards: [award] }).awards).toEqual([award]);
  expect(parseDayAwardsV2({ ...base, day: "2026-10-01", earned: false, awards: [] }).earned).toBe(false);
  expect(() => parseDayAwardsV2({ ...base, earned: false, awards: [award] })).toThrow();
  expect(() => parseDayAwardsV2({ ...base, earned: true, awards: [] })).toThrow();
  expect(() =>
    parseDayAwardsV2({
      ...base,
      earned: true,
      awards: [{ ...award, earned_day: "2026-11-01" }],
    }),
  ).toThrow();
  expect(() => parseDayAwardsV2({ ...base, earned: true, awards: "none" })).toThrow();
});
