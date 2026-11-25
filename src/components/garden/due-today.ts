import { seedAvailability, type CatalogItem, type GardenState, type Plant } from "@/lib/garden/model";
import {
  careStatus as sharedCareStatus,
  todayPlan as sharedTodayPlan,
  LEGACY_CARE,
  type CareStatus as SharedCareStatus,
  type TodayPlan as SharedTodayPlan,
} from "@/lib/garden/care";

// The care rules are shared with the new garden (src/lib/garden/care.ts); the
// legacy garden applies them with decay and its planting availability.
export { cueLabel, sheetCue, takesDailyCare, type FlowerCue } from "@/lib/garden/care";

export type CareStatus = SharedCareStatus<Plant, CatalogItem>;
export type TodayPlan = SharedTodayPlan<Plant, CatalogItem>;

/** Today's care state for one flower, or null when it takes no daily care. */
export function careStatus(
  plant: Plant,
  item: CatalogItem,
  state: Pick<GardenState, "member_id" | "moonflower_open">,
): CareStatus | null {
  return sharedCareStatus(plant, item, state, LEGACY_CARE);
}

/** Everything the Today card shows, derived only from the garden state. */
export function todayPlan(state: GardenState): TodayPlan {
  return sharedTodayPlan(state, {
    canPlant: state.catalog.some((item) => seedAvailability(item, state).available),
    rules: LEGACY_CARE,
  });
}
