/**
 * Today's care for a flower, shared by the legacy garden (decision 0051) and
 * the new garden (decision 0067). Pure and structural, so either garden's
 * state shape works. The only difference is decay: the legacy garden loses a
 * growth unit when a pair is missed (so a flower can be "at risk"); the new
 * garden never decays.
 */

/** The fields of a plant that today's care reads. */
export type CarePlant = {
  flower: {
    type_key: string;
    spot: number;
    growth_units: number;
    first_bloom_at: string | null;
    fulfilled_at: string | null;
  };
  member1_submitted: boolean;
  member2_submitted: boolean;
};
export type CareItem = { type_key: string; growth_target: number };
export type CareState = { member_id: 1 | 2; moonflower_open: boolean };

export interface CareRules {
  /** A missed pair loses a growth unit (legacy garden only). */
  readonly decay: boolean;
}
export const LEGACY_CARE: CareRules = { decay: true };
export const NO_DECAY: CareRules = { decay: false };

/** The one surface cue a flower shows today (decision 0051). */
export type FlowerCue = "partner-cared" | "blooms" | "at-risk" | null;

export type CareStatus<P extends CarePlant = CarePlant, I extends CareItem = CareItem> = {
  plant: P;
  item: I;
  /** The signed-in member cared for it this garden day. */
  you: boolean;
  /** The other member cared for it this garden day. */
  partner: boolean;
  /** A Moonflower outside 10 p.m.–4 a.m. Pacific: care opens later today. */
  later: boolean;
  dueForYou: boolean;
  dueForPartner: boolean;
  cue: FlowerCue;
};

/**
 * Whether a flower takes daily care at all. Peony has its own milestones, and
 * a bloomed flower is permanent and needs no care, except the Cactus, which
 * keeps its check-ins. A fulfilled Dandelion wish is always bloomed, so it is
 * excluded too.
 */
export function takesDailyCare(plant: CarePlant) {
  const flower = plant.flower;
  if (flower.type_key === "peony" || flower.fulfilled_at) return false;
  return flower.first_bloom_at === null || flower.type_key === "cactus";
}

/** Today's care state for one flower, or null when it takes no daily care. */
export function careStatus<P extends CarePlant, I extends CareItem>(
  plant: P,
  item: I,
  state: CareState,
  rules: CareRules = LEGACY_CARE,
): CareStatus<P, I> | null {
  if (!takesDailyCare(plant)) return null;
  const you = state.member_id === 1 ? plant.member1_submitted : plant.member2_submitted;
  const partner = state.member_id === 1 ? plant.member2_submitted : plant.member1_submitted;
  const later = plant.flower.type_key === "moonflower" && !state.moonflower_open;
  const growing = plant.flower.first_bloom_at === null;
  const units = plant.flower.growth_units;
  // Paired care adds one unit at the 4 a.m. rollover. In the legacy garden an
  // incomplete pair loses one, floored at zero, and Cactus never loses growth
  // (decision 0010). The new garden never decays.
  const cue: FlowerCue =
    partner && !you
      ? "partner-cared"
      : you && partner && growing && units + 1 >= item.growth_target
        ? "blooms"
        : rules.decay && !you && !partner && growing && units > 0 && item.type_key !== "cactus"
          ? "at-risk"
          : null;
  return { plant, item, you, partner, later, dueForYou: !you && !later, dueForPartner: !partner && !later, cue };
}

// Your care completes a pair first, then flowers that would lose growth
// (largest first), then the rest; spot order breaks ties. Flowers waiting on
// your partner and a closed Moonflower come last.
function rank(status: CareStatus) {
  if (status.dueForYou) return status.partner ? 0 : status.cue === "at-risk" ? 1 : 2;
  return status.later ? 4 : 3;
}

export type TodayPlan<P extends CarePlant = CarePlant, I extends CareItem = CareItem> = {
  /** Flowers you can care for now. */
  you: number;
  /** Flowers your partner can care for now. */
  partner: number;
  /** Flowers still waiting on either of you, including a closed Moonflower. */
  rows: CareStatus<P, I>[];
  /** The flower 'Tend next' opens, or null when nothing is due for you. */
  next: CareStatus<P, I> | null;
  /** The first empty spot, when a seed can be planted there. */
  plantSpot: number | null;
  /** Both of you have cared for every flower, and nothing opens later. */
  allTended: boolean;
};

export type PlanState<P extends CarePlant, I extends CareItem> = CareState & {
  catalog: I[];
  plants: P[];
  garden: { spot_capacity: number };
};

/** Everything a "today" summary shows, derived only from the garden state. */
export function todayPlan<P extends CarePlant, I extends CareItem>(
  state: PlanState<P, I>,
  options: { canPlant: boolean; rules?: CareRules },
): TodayPlan<P, I> {
  const rules = options.rules ?? LEGACY_CARE;
  const catalog = new Map(state.catalog.map((item) => [item.type_key, item]));
  const statuses = state.plants.flatMap((plant) => {
    const item = catalog.get(plant.flower.type_key);
    const status = item && careStatus(plant, item, state, rules);
    return status ? [status] : [];
  });
  const rows = statuses
    .filter((status) => !status.you || !status.partner)
    .sort((a, b) => {
      const order = rank(a) - rank(b);
      if (order) return order;
      if (a.cue === "at-risk" && b.cue === "at-risk") {
        const units = b.plant.flower.growth_units - a.plant.flower.growth_units;
        if (units) return units;
      }
      return a.plant.flower.spot - b.plant.flower.spot;
    });
  const taken = new Set(state.plants.map((plant) => plant.flower.spot));
  let plantSpot: number | null = null;
  if (options.canPlant)
    for (let spot = 1; spot <= state.garden.spot_capacity; spot++)
      if (!taken.has(spot)) {
        plantSpot = spot;
        break;
      }
  return {
    you: rows.filter((status) => status.dueForYou).length,
    partner: rows.filter((status) => status.dueForPartner).length,
    rows,
    next: rows.find((status) => status.dueForYou) ?? null,
    plantSpot,
    allTended: rows.length === 0,
  };
}

/** Words appended to a flower button's accessible name for its cue. */
export function cueLabel(cue: FlowerCue, partnerName = "your partner") {
  return cue === "partner-cared"
    ? `, ${partnerName} cared, add yours`
    : cue === "blooms"
      ? ", blooms at 4 a.m."
      : cue === "at-risk"
        ? ", may lose growth at 4 a.m."
        : "";
}

/** The one-line cue under the flower sheet heading, or null for none. */
export function sheetCue(status: CareStatus | null, partnerName = "Your partner") {
  if (!status?.cue) return null;
  if (status.cue === "partner-cared")
    return status.plant.flower.first_bloom_at
      ? `${partnerName} checked in today. Add yours before 4 a.m. to check in together.`
      : `${partnerName} cared today. Add yours before 4 a.m. to grow.`;
  if (status.cue === "blooms") return "You both cared today. It blooms at 4 a.m.";
  return status.later
    ? "No care yet today. It opens at 10 p.m. and needs you both by 4 a.m., or it loses a growth unit."
    : "No care yet today. It needs you both by 4 a.m., or it loses a growth unit.";
}
