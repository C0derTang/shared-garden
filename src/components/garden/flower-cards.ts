import type { Entry, GardenState, Plant } from "@/lib/garden/model";

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
 * Whether a flower still wants your care today. It matches the surface care
 * dots: Peony, ordinary permanent blooms (so fulfilled Dandelions too) and a
 * closed Moonflower are never due.
 *
 * TODO(dedupe): issue #119 adds a pure due-rule module for the Today card.
 * Once both land, replace this minimal local helper with that module.
 */
function dueForYou(plant: Plant, state: GardenState) {
  const type = plant.flower.type_key;
  if (type === "peony") return false;
  if (plant.flower.first_bloom_at !== null && type !== "cactus") return false;
  if (type === "moonflower" && !state.moonflower_open) return false;
  return !(state.member_id === 1
    ? plant.member1_submitted
    : plant.member2_submitted);
}

/** The next due flower after `spot`, in spot order, wrapping around. */
export function nextDueFlower(state: GardenState, spot: number) {
  const due = state.plants
    .filter((plant) => plant.flower.spot !== spot && dueForYou(plant, state))
    .sort((a, b) => a.flower.spot - b.flower.spot);
  return due.find((plant) => plant.flower.spot > spot) ?? due[0] ?? null;
}
