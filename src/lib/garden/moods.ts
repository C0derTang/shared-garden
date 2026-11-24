/**
 * Hydrangea mood colors shared by the legacy garden and the new garden.
 * Pure: no React or artwork imports, so either garden (and the procedural
 * flowers) can use the palette and the pick rules without pulling in the
 * other's components.
 */

export const moodKeys = ["calm", "joyful", "tender", "energized", "low", "tense"] as const;
export type MoodKey = (typeof moodKeys)[number];
export const OTHER_MOOD = "other";
export const MOOD_NOTE_LIMIT = 140;

/** A member's saved Hydrangea pick: one or two colors, or Other with a note. */
export type MoodPick = { mood: MoodKey | typeof OTHER_MOOD; mood2?: MoodKey; note?: string };

/** The fixed mood palette, in display order. */
export const moods: { key: MoodKey; label: string; color: string }[] = [
  { key: "calm", label: "Calm · Blue", color: "#6f9eab" },
  { key: "joyful", label: "Joyful · Yellow", color: "#e2b84f" },
  { key: "tender", label: "Tender · Pink", color: "#d88798" },
  { key: "energized", label: "Energized · Orange", color: "#d9854f" },
  { key: "low", label: "Low · Lavender", color: "#8b87ab" },
  { key: "tense", label: "Tense · Red", color: "#b86b61" },
];

const colors: Record<MoodKey, string> = Object.fromEntries(moods.map((m) => [m.key, m.color])) as Record<MoodKey, string>;

export const isMoodKey = (value: unknown): value is MoodKey => typeof value === "string" && Object.hasOwn(colors, value);

/** The palette color of a mood. */
export const moodColorOf = (key: MoodKey) => colors[key];

/** Mid-point of two palette colors, so a blend never leaves the fixed palette's range. */
export function blendMoodColors(a: MoodKey, b: MoodKey) {
  const mix = (i: number) =>
    Math.round((parseInt(colors[a].slice(i, i + 2), 16) + parseInt(colors[b].slice(i, i + 2), 16)) / 2)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(1)}${mix(3)}${mix(5)}`;
}

/** A saved Hydrangea payload as a validated pick, or null when it is not one. */
export function moodPick(payload: Record<string, unknown>): MoodPick | null {
  const { mood, mood2, note } = payload;
  if (mood !== OTHER_MOOD && !isMoodKey(mood)) return null;
  if (note !== undefined && (typeof note !== "string" || !note.trim() || Array.from(note).length > MOOD_NOTE_LIMIT))
    return null;
  if (mood === OTHER_MOOD) {
    if (mood2 !== undefined || typeof note !== "string") return null;
    return { mood, note };
  }
  if (mood2 !== undefined && (!isMoodKey(mood2) || mood2 === mood)) return null;
  return { mood, ...(mood2 ? { mood2 } : {}), ...(note ? { note } : {}) };
}

/** Palette entries behind a pick, in the member's chosen order. Other has none. */
export function moodSwatches(pick: MoodPick) {
  return [pick.mood, pick.mood2]
    .map((key) => moods.find((m) => m.key === key))
    .filter((m): m is (typeof moods)[number] => !!m);
}

export function moodLabel(pick: MoodPick) {
  const named = moodSwatches(pick).map((m) => m.label);
  return named.length ? named.join(" + ") : "Other";
}

/** One color for a pick: the color, the blend, or null for Other. */
export function moodBlend(pick: MoodPick) {
  if (pick.mood === OTHER_MOOD) return null;
  return pick.mood2 ? blendMoodColors(pick.mood, pick.mood2) : colors[pick.mood];
}

/**
 * The draft after toggling a mood option: the first color is the main tone,
 * the second the accent, and Other stands alone. A third color is ignored.
 */
export function toggleMood(draft: Record<string, string>, key: string): Record<string, string> {
  const { mood, mood2, ...rest } = draft;
  if (key === OTHER_MOOD) return mood === OTHER_MOOD ? rest : { ...rest, mood: OTHER_MOOD };
  if (mood === key) return mood2 ? { ...rest, mood: mood2 } : rest;
  if (mood2 === key) return { ...rest, mood: mood! };
  if (!mood || mood === OTHER_MOOD) return { ...rest, mood: key };
  if (!mood2) return { ...rest, mood, mood2: key };
  return draft;
}
