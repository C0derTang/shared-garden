export type Achievement = {
  achievement_id: string;
  position: number;
  title: string;
  target: number;
  unit: string;
  requirement: string;
  progress: number;
  earned_at: string | null;
};
export type AchievementState = {
  server_now: string;
  current_streak: number;
  achievements: Achievement[];
};
export type AchievementResult = {
  state: AchievementState | null;
  error: string | null;
};

export function parseAchievements(value: unknown): AchievementState {
  if (!value || typeof value !== "object") throw Error("Invalid achievements");
  const state = value as AchievementState;
  if (
    !Number.isFinite(Date.parse(state.server_now)) ||
    !Number.isInteger(state.current_streak) ||
    state.current_streak < 0 ||
    !Array.isArray(state.achievements) ||
    state.achievements.length !== 26
  )
    throw Error("Invalid achievements");
  const ids = new Set<string>();
  const positions = new Set<number>();
  for (const item of state.achievements) {
    if (
      !item ||
      typeof item.achievement_id !== "string" ||
      !item.achievement_id ||
      ids.has(item.achievement_id) ||
      !Number.isInteger(item.position) ||
      item.position < 1 ||
      item.position > 26 ||
      positions.has(item.position) ||
      typeof item.title !== "string" ||
      typeof item.requirement !== "string" ||
      typeof item.unit !== "string" ||
      !Number.isInteger(item.target) ||
      item.target < 1 ||
      !Number.isInteger(item.progress) ||
      item.progress < 0 ||
      item.progress > item.target ||
      (item.earned_at !== null &&
        (typeof item.earned_at !== "string" ||
          !Number.isFinite(Date.parse(item.earned_at))))
    )
      throw Error("Invalid achievement");
    ids.add(item.achievement_id);
    positions.add(item.position);
  }
  return {
    ...state,
    achievements: [...state.achievements].sort(
      (a, b) => a.position - b.position,
    ),
  };
}
