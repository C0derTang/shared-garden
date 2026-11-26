/**
 * The hidden keyboard list groups flowers and their planting targets by type
 * area. Flower spots keep their persisted IDs; negative spots are view-only
 * area targets, never database planting addresses.
 */

import { typeAreaLayout } from "./type-areas";
import { captionName, catalogItem, gardenCareStatus, stageWords } from "./flowers";
import type { GardenState, Plant } from "./model";

export interface GardenPlot {
  /** Persisted flower spot, or a negative view-only planting-area ID. */
  readonly spot: number;
  /** One-based address module, retained for plot consumers. */
  readonly bed: number;
  /** The flower growing there, if any. */
  readonly plant: Plant | null;
  /** Short growth/care words followed by the named area. */
  readonly label: string;
  /** What a screen reader hears for the plot. */
  readonly ariaLabel: string;
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

/** Type order, then persisted flower address, then that area's planting target. */
export function gardenPlots(state: GardenState, partner: string): GardenPlot[] {
  return typeAreaLayout(state).areas.flatMap((area): GardenPlot[] => {
    const plants = area.plants.map((plant): GardenPlot => {
      const bed = Math.floor((plant.flower.spot - 1) / 12) + 1;
      const name = captionName(catalogItem(state, plant.flower.type_key), plant.flower.type_key);
      return {
        spot: plant.flower.spot, bed, plant,
        label: `${name} · ${plotGrowth(plant, state)}${waitsOnYou(plant, state) ? " ♡" : ""} · ${area.name} area`,
        ariaLabel: `${flowerLabel(plant, state, partner)}. ${area.name} area`,
      };
    });
    return [...plants, {
      spot: area.target.spot, bed: Math.floor((area.target.persistedSpot - 1) / 12) + 1, plant: null,
      label: `plant ${area.name} · ${area.name} area`, ariaLabel: `Plant a ${area.name} in the ${area.name} area`,
    }];
  });
}

/**
 * The one rule for the garden's "♡" (#214): a flower still waits on your care
 * today when its daily care is open for you now and you have not cared for it
 * this garden day (`dueForYou` in the shared care rules). Never the Peony (no
 * daily care), a bloomed flower that needs no more care, a Moonflower before
 * its 10 p.m. window or a flower you already cared for. Your partner's care
 * does not change it. Both the ♡ floating over the flower in the world and the
 * ♡ in the hidden plot list's chip use it, so they always agree.
 */
export function waitsOnYou(plant: Plant, state: GardenState): boolean {
  return gardenCareStatus(plant, catalogItem(state, plant.flower.type_key), state)?.dueForYou === true;
}

/** Flowers still waiting on your care today ({@link waitsOnYou}), in spot order; each gets a floating "♡". */
export function waitingOnYou(state: GardenState): Plant[] {
  return state.plants.filter((plant) => waitsOnYou(plant, state)).sort((a, b) => a.flower.spot - b.flower.spot);
}
