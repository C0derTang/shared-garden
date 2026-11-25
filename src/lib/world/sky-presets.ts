/** Sample instants on the summer solstice in America/Los_Angeles (UTC-7), for previews. */
export const SKY_PRESETS = {
  dawn: "2026-06-21T05:52:00-07:00",
  morning: "2026-06-21T08:30:00-07:00",
  day: "2026-06-21T12:30:00-07:00",
  dusk: "2026-06-21T19:52:00-07:00",
  night: "2026-06-21T23:30:00-07:00",
} as const;

export type SkyPreset = keyof typeof SKY_PRESETS | "live";

export function isSkyPreset(value: unknown): value is SkyPreset {
  return value === "live" || (typeof value === "string" && Object.hasOwn(SKY_PRESETS, value));
}
