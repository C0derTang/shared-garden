import type { Entry, GardenState, Plant } from "@/lib/garden/model";
import { careStatus } from "./due-today";

export type FlowerCard = {
  who: "partner" | "you";
  entries: Entry[];
  /** From the authoritative day markers, the same source as the care dots. */
  cared: boolean;
};

/**
 * The You and Partner cards for a flower sheet (decision 0053). The partner
 * card leads once it has something to show. Otherwise your card leads, since
 * it holds the form. A flower that needs no daily care shows only the cards
 * that have entries.
 */
export function flowerCards(
  plant: Plant,
  memberId: 1 | 2,
  dailyCare: boolean,
): FlowerCard[] {
  const partnerId = memberId === 1 ? 2 : 1;
  const you: FlowerCard = {
    who: "you",
    entries: plant.entries.filter((entry) => entry.author_id === memberId),
    cared: memberId === 1 ? plant.member1_submitted : plant.member2_submitted,
  };
  const partner: FlowerCard = {
    who: "partner",
    entries: plant.entries.filter((entry) => entry.author_id === partnerId),
    cared: memberId === 1 ? plant.member2_submitted : plant.member1_submitted,
  };
  if (!dailyCare)
    return [partner, you].filter((card) => card.entries.length > 0);
  return partner.entries.length > 0 || partner.cared
    ? [partner, you]
    : [you, partner];
}

/**
 * The next flower due for you after `spot`, in spot order, wrapping around.
 * "Due" is the shared rule in `due-today.ts` (decision 0051), which matches the
 * care dots and keeps a closed Moonflower out.
 */
export function nextDueFlower(state: GardenState, spot: number) {
  const catalog = new Map(state.catalog.map((item) => [item.type_key, item]));
  const due = state.plants
    .filter((plant) => {
      if (plant.flower.spot === spot) return false;
      const item = catalog.get(plant.flower.type_key);
      return !!item && !!careStatus(plant, item, state)?.dueForYou;
    })
    .sort((a, b) => a.flower.spot - b.flower.spot);
  return due.find((plant) => plant.flower.spot > spot) ?? due[0] ?? null;
}
