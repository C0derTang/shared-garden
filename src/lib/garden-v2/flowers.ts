/**
 * How the new garden's state becomes painted flowers and words: growth
 * fractions, Hydrangea mood colours, the Dandelion puff, stage wording and
 * which flowers have their own activity yet. Pure, so it is unit tested.
 */
import { moodColorOf, OTHER_MOOD, type MoodPick } from "@/lib/garden/moods";
import type { CatalogItem, FlowerType, GardenState, Plant } from "./model";

/** Flowers whose activity is the shared daily entry form in this garden. */
export const CARE_TYPES: readonly FlowerType[] = [
  "rose",
  "cactus",
  "tulip",
  "marigold",
  "daisy",
  "hydrangea",
  "snapdragon",
  "moonflower",
  "dandelion",
  "forget-me-not",
];
/** Flowers whose own activity (photo, voice, milestones) arrives later. */
export const COMING_SOON_TYPES: readonly FlowerType[] = ["sunflower", "bluebell", "peony"];

export const hasCareActivity = (type: FlowerType) => CARE_TYPES.includes(type);

/** The procedural flower's description (see `FlowerSpec`). */
export interface PlantSpec {
  readonly type: FlowerType;
  readonly seed: number;
  readonly growth: number;
  readonly moodColors?: readonly string[];
  readonly puff?: boolean;
}

export function catalogItem(state: Pick<GardenState, "catalog">, type: FlowerType): CatalogItem | undefined {
  return state.catalog.find((item) => item.type_key === type);
}

/** Growth as a fraction of the target: 1 once bloomed, never above it. */
export function growthFraction(plant: Plant, item: CatalogItem | undefined) {
  if (plant.flower.first_bloom_at) return 1;
  const target = item?.growth_target ?? 1;
  return Math.min(1, Math.max(0, plant.flower.growth_units / Math.max(1, target)));
}

/** Palette colours of one saved pick, main tone first; Other has none. */
export function pickColors(pick: MoodPick | null): string[] {
  if (!pick || pick.mood === OTHER_MOOD) return [];
  return [moodColorOf(pick.mood), ...(pick.mood2 ? [moodColorOf(pick.mood2)] : [])];
}

/** A Hydrangea takes both members' latest mood colours; none keeps its seeded colour. */
export function hydrangeaColors(plant: Plant): string[] | undefined {
  if (plant.flower.type_key !== "hydrangea") return undefined;
  const colors = [...pickColors(plant.hydrangea_picks[0]), ...pickColors(plant.hydrangea_picks[1])];
  return colors.length ? colors : undefined;
}

/**
 * A bloomed Dandelion waiting on its wish is a seed puff, ready to blow. Once
 * the wish is fulfilled its seeds have flown, and it shows its golden head as
 * a keepsake.
 */
export function showsPuff(plant: Plant) {
  return plant.flower.type_key === "dandelion" && plant.flower.first_bloom_at !== null && plant.flower.fulfilled_at === null;
}

export function plantSpec(plant: Plant, item: CatalogItem | undefined): PlantSpec {
  const colors = hydrangeaColors(plant);
  return {
    type: plant.flower.type_key,
    seed: plant.flower.seed,
    growth: growthFraction(plant, item),
    ...(colors ? { moodColors: colors } : {}),
    ...(showsPuff(plant) ? { puff: true } : {}),
  };
}

/** A few handwritten words for where the flower is in its life. */
export function stageWords(plant: Plant, item: CatalogItem | undefined) {
  const flower = plant.flower;
  if (flower.fulfilled_at) return "wish fulfilled";
  if (flower.first_bloom_at) return flower.type_key === "dandelion" ? "gone to seed" : "in bloom";
  const fraction = growthFraction(plant, item);
  if (fraction >= 0.5) return "opening";
  if (fraction >= 0.25) return "in bud";
  return flower.growth_units === 0 ? "just planted" : "a seedling";
}

/** Lower-case flower name for floating captions. */
export const captionName = (item: CatalogItem | undefined, type: FlowerType) => (item?.display_name ?? type).toLowerCase();

const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
/** A garden day (YYYY-MM-DD) as "Nov 24". */
export function gardenDayLabel(day: string) {
  const parsed = Date.parse(`${day}T12:00:00Z`);
  return Number.isFinite(parsed) ? dateFormat.format(new Date(parsed)) : day;
}

/** A stable preview seed per type, for the planting preview (real seeds come from the server). */
export function previewSeed(type: FlowerType) {
  let hash = 2166136261;
  for (const char of type) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
}
