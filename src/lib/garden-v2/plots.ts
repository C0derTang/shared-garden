/**
 * The plot navigator's list (#206): every spot of the open beds, planted or
 * empty, in the world's navigator order, with the words the navigator shows
 * and says for each.
 */

import { bedOfSpot, plotOrder } from "@/lib/world/plots";
import { captionName, catalogItem, gardenCareStatus, stageWords } from "./flowers";
import type { GardenState, Plant } from "./model";

export interface GardenPlot {
  /** One-based spot. */
  readonly spot: number;
  /** One-based bed number as the navigator says it ("bed 2"). */
  readonly bed: number;
  /** The flower growing there, if any. */
  readonly plant: Plant | null;
  /** The navigator's short words: "rose · 3 of 5", "rose · in bloom", "empty spot". */
  readonly label: string;
  /** The quieter line under it: "bed 2". */
  readonly detail: string;
  /** What a screen reader hears for the option. */
  readonly ariaLabel: string;
  /** Your care is open for this flower today. */
  readonly due: boolean;
}

/** Growth in the panel's "x of y" words, or the stage once it has bloomed. */
export function plotGrowth(plant: Plant, state: GardenState): string {
  const item = catalogItem(state, plant.flower.type_key);
  if (plant.flower.first_bloom_at) return stageWords(plant, item);
  const target = item?.growth_target;
  return target ? `${Math.min(plant.flower.growth_units, target)} of ${target}` : stageWords(plant, item);
}

/** The accessible name of a flower: its type, stage and growth, and who has cared today. */
export function flowerLabel(plant: Plant, state: GardenState, partner: string) {
  const item = catalogItem(state, plant.flower.type_key);
  const name = item?.display_name ?? plant.flower.type_key;
  const growth = plant.flower.first_bloom_at
    ? stageWords(plant, item)
    : `${stageWords(plant, item)}, ${Math.min(plant.flower.growth_units, item?.growth_target ?? 0)} of ${item?.growth_target ?? "?"}`;
  const status = gardenCareStatus(plant, item, state);
  const care = !status
    ? ""
    : `. ${status.you ? "You cared today" : status.later ? "Opens at 10 p.m." : "Your care is open"}; ${partner} ${status.partner ? "cared today" : "has not yet"}`;
  return `${name}, ${growth}${care}`;
}

/** Every plot of the open beds in navigator order. */
export function gardenPlots(state: GardenState, partner: string): GardenPlot[] {
  const bySpot = new Map(state.plants.map((plant) => [plant.flower.spot, plant]));
  return plotOrder(state.garden.spot_capacity).map((spot) => {
    const bed = bedOfSpot(spot) + 1;
    const plant = bySpot.get(spot) ?? null;
    if (!plant) {
      return { spot, bed, plant, label: "empty spot", detail: `bed ${bed}`, ariaLabel: `Empty spot, bed ${bed}`, due: false };
    }
    const item = catalogItem(state, plant.flower.type_key);
    const status = gardenCareStatus(plant, item, state);
    const name = captionName(item, plant.flower.type_key);
    const waiting = status?.cue === "partner-cared";
    return {
      spot,
      bed,
      plant,
      label: `${name} · ${plotGrowth(plant, state)}${waiting ? " ♡" : ""}`,
      detail: `bed ${bed}`,
      ariaLabel: `${flowerLabel(plant, state, partner)}. Bed ${bed}`,
      due: Boolean(status?.dueForYou),
    };
  });
}
