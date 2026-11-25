/**
 * New-garden (v2) achievements: the legacy catalog minus Recovery (no decay in
 * the new garden), with the garden day each award was earned (decision 0067).
 */
export const V2_ACHIEVEMENT_COUNT = 25;

export type AchievementV2 = {
  achievement_id: string;
  position: number;
  title: string;
  target: number;
  unit: string;
  requirement: string;
  progress: number;
  earned_at: string | null;
  /** Garden day (4 a.m. America/Los_Angeles boundary) the award was earned. */
  earned_day: string | null;
};
export type AchievementStateV2 = {
  server_now: string;
  garden_day: string;
  current_streak: number;
  achievements: AchievementV2[];
};
export type DayAwardV2 = {
  achievement_id: string;
  title: string;
  earned_at: string;
  earned_day: string;
};
/** Whether any achievement was earned during `day` (drives the night fireworks). */
export type DayAwardsV2 = {
  server_now: string;
  garden_day: string;
  day: string;
  earned: boolean;
  awards: DayAwardV2[];
};

function fail(): never {
  throw new Error("Invalid achievements response");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  return value as Record<string, unknown>;
}
const time = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const day = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const text = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const whole = (v: unknown, min: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;

export function parseAchievementsV2(value: unknown): AchievementStateV2 {
  const state = object(value);
  if (!time(state.server_now) || !day(state.garden_day) || !whole(state.current_streak, 0)) fail();
  if (!Array.isArray(state.achievements) || state.achievements.length !== V2_ACHIEVEMENT_COUNT) fail();
  const ids = new Set<string>();
  const positions = new Set<number>();
  const achievements = state.achievements.map((raw) => {
    const a = object(raw);
    if (
      !text(a.achievement_id) ||
      ids.has(a.achievement_id) ||
      !whole(a.position, 1) ||
      a.position > V2_ACHIEVEMENT_COUNT ||
      positions.has(a.position) ||
      !text(a.title) ||
      !text(a.unit) ||
      !text(a.requirement) ||
      !whole(a.target, 1) ||
      !whole(a.progress, 0) ||
      a.progress > a.target ||
      (a.earned_at === null) !== (a.earned_day === null) ||
      (a.earned_at !== null && (!time(a.earned_at) || !day(a.earned_day)))
    )
      fail();
    ids.add(a.achievement_id);
    positions.add(a.position);
    return a as unknown as AchievementV2;
  });
  return {
    server_now: state.server_now,
    garden_day: state.garden_day,
    current_streak: state.current_streak,
    achievements: achievements.sort((a, b) => a.position - b.position),
  };
}

export function parseDayAwardsV2(value: unknown): DayAwardsV2 {
  const state = object(value);
  if (!time(state.server_now) || !day(state.garden_day) || !day(state.day) || typeof state.earned !== "boolean") fail();
  if (!Array.isArray(state.awards)) fail();
  const awards = state.awards.map((raw) => {
    const a = object(raw);
    if (!text(a.achievement_id) || !text(a.title) || !time(a.earned_at) || a.earned_day !== state.day) fail();
    return a as unknown as DayAwardV2;
  });
  if (state.earned !== awards.length > 0) fail();
  return {
    server_now: state.server_now,
    garden_day: state.garden_day,
    day: state.day,
    earned: state.earned,
    awards,
  };
}
