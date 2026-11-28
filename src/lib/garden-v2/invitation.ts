import { captionName, gardenTodayPlan } from "./flowers";
import type { FlowerType, GardenState } from "./model";

/** Plain descriptions of the existing forms; opening one never submits it. */
const ACTION: Record<Exclude<FlowerType, "peony">, string> = {
  rose: "write a note",
  cactus: "check in",
  tulip: "share a song",
  marigold: "leave an appreciation",
  daisy: "answer a question",
  hydrangea: "choose a mood color",
  sunflower: "share a photo",
  snapdragon: "write an honest check-in",
  moonflower: "leave a late-night thought",
  bluebell: "record a voice memo",
  dandelion: "add to a wish",
  "forget-me-not": "share a memory",
};

export interface GardenInvitation { readonly id: string; readonly name: string; readonly action: string }

/** The canonical care plan owns eligibility, ranking and actual instance identity. */
export function nextGardenVisit(state: GardenState): GardenInvitation | null {
  const next = gardenTodayPlan(state).next;
  if (!next || next.plant.flower.type_key === "peony") return null;
  const { id, type_key } = next.plant.flower;
  return { id, name: captionName(next.item, type_key), action: ACTION[type_key] };
}
