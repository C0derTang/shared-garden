import { seedAvailability, type GardenState } from "@/lib/garden/model";
export type MemberSettings = { revision: number; guide: "open" | "skipped" | "finished"; gentle_motion: boolean };
export type SettingChange = { guide: MemberSettings["guide"] } | { gentle_motion: boolean };
export type SettingsResult = { state: MemberSettings | null; error: string | null };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid setting");
  return value as Record<string, unknown>;
}
const validGuide = (value: unknown): value is MemberSettings["guide"] => typeof value === "string" && ["open", "skipped", "finished"].includes(value);
export function parseSettings(value: unknown): MemberSettings {
  const row = record(value);
  if (!Number.isSafeInteger(row.revision) || (row.revision as number) < 0 || !validGuide(row.guide) || typeof row.gentle_motion !== "boolean") throw Error("Invalid settings");
  return { revision: row.revision as number, guide: row.guide, gentle_motion: row.gentle_motion };
}
export function parseSettingChange(value: unknown): SettingChange {
  const row = record(value);
  if (Object.keys(row).length !== 1) throw Error("Change one setting");
  if (Object.hasOwn(row, "guide") && validGuide(row.guide)) return { guide: row.guide };
  if (Object.hasOwn(row, "gentle_motion") && typeof row.gentle_motion === "boolean") return { gentle_motion: row.gentle_motion };
  throw Error("Invalid setting");
}
export type GuideStep = { kind: "cactus" | "rose" | "plant" | "blooms"; spot: number } | { kind: "ready" | "unavailable" };
export function guideStep(state: GardenState): GuideStep {
  const facts = state.tutorial_facts;
  const roses = state.plants.filter((p) => p.flower.type_key === "rose").sort((a, b) => a.flower.spot - b.flower.spot);
  const growing = roses.find((p) => !p.flower.first_bloom_at);
  // A late arrival joins existing shared care before learning Cactus.
  if (!facts.rose_noted && growing) return { kind: "rose", spot: growing.flower.spot };
  if (!facts.rose_noted && roses.length) return { kind: "blooms", spot: roses[0].flower.spot };
  if (!facts.cactus_checked_in) {
    const cactus = state.plants.find((p) => p.flower.type_key === "cactus");
    return cactus ? { kind: "cactus", spot: cactus.flower.spot } : { kind: "unavailable" };
  }
  if (facts.rose_noted) return { kind: "ready" };
  const rose = state.catalog.find((c) => c.type_key === "rose");
  if (rose && seedAvailability(rose, state).available) {
    const spots = new Set(state.plants.map((p) => p.flower.spot));
    for (let spot = 1; spot <= state.garden.spot_capacity; spot++) if (!spots.has(spot)) return { kind: "plant", spot };
  }
  return { kind: "unavailable" };
}
