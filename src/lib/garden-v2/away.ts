/**
 * "While you were away" for the new garden. A small snapshot is kept in this
 * browser only, per member: flower ids with their growth, blooms, fulfilled
 * wishes and the flowers your partner cared for today. It never holds entry
 * text, wishes, media or other private content. Nothing decays here, so the
 * news is only ever good: new flowers, growth, blooms, wishes and care.
 */
import type { GardenState, Plant } from "./model";

export type AwaySnapshot = {
  v: 1;
  /** Flower id → growth units when last seen. */
  growth: Record<string, number>;
  blooms: string[];
  fulfilled: string[];
  /** The garden day `partnerCare` belongs to. */
  careDay: string;
  partnerCare: string[];
};

export type AwayNews = {
  /** Flowers your partner planted. */
  planted: Plant[];
  /** Flowers that grew (and have not bloomed since). */
  grew: Plant[];
  bloomed: Plant[];
  fulfilled: Plant[];
  /** Flowers your partner cared for today. */
  partnerCare: Plant[];
};

export const awayKey = (memberId: 1 | 2) => `ccsgarden:v2:since-last-visit:v1:${memberId}`;

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");

/** Anything unreadable counts as no snapshot (a first visit), so it never invents news. */
export function parseAwaySnapshot(raw: string | null): AwaySnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AwaySnapshot> | null;
    const growth = value?.growth;
    if (
      value?.v === 1 &&
      growth &&
      typeof growth === "object" &&
      !Array.isArray(growth) &&
      Object.values(growth).every((units) => typeof units === "number" && Number.isFinite(units)) &&
      strings(value.blooms) &&
      strings(value.fulfilled) &&
      typeof value.careDay === "string" &&
      strings(value.partnerCare)
    )
      return value as AwaySnapshot;
  } catch {
    // Unreadable JSON is a first visit.
  }
  return null;
}

const partnerCared = (state: GardenState, plant: Plant) =>
  state.member_id === 1 ? plant.member2_submitted : plant.member1_submitted;

export function takeAwaySnapshot(state: GardenState): AwaySnapshot {
  return {
    v: 1,
    growth: Object.fromEntries(state.plants.map((p) => [p.flower.id, p.flower.growth_units])),
    blooms: state.plants.filter((p) => p.flower.first_bloom_at).map((p) => p.flower.id),
    fulfilled: state.plants.filter((p) => p.flower.fulfilled_at).map((p) => p.flower.id),
    careDay: state.garden_day,
    partnerCare: state.plants.filter((p) => partnerCared(state, p)).map((p) => p.flower.id),
  };
}

export const noAwayNews: AwayNews = { planted: [], grew: [], bloomed: [], fulfilled: [], partnerCare: [] };

/** What happened since `previous`. With no snapshot (a first visit) nothing is news. */
export function diffAway(previous: AwaySnapshot | null, state: GardenState): AwayNews {
  if (!previous) return noAwayNews;
  const blooms = new Set(previous.blooms);
  const fulfilled = new Set(previous.fulfilled);
  // After a rollover, every partner care on the new day happened since.
  const cared = new Set(previous.careDay === state.garden_day ? previous.partnerCare : []);
  const known = (p: Plant) => Object.hasOwn(previous.growth, p.flower.id);
  const bloomed = state.plants.filter((p) => p.flower.first_bloom_at && !blooms.has(p.flower.id));
  const bloomedIds = new Set(bloomed.map((p) => p.flower.id));
  return {
    planted: state.plants.filter((p) => !known(p) && p.flower.planted_by !== state.member_id),
    grew: state.plants.filter(
      (p) => known(p) && !bloomedIds.has(p.flower.id) && p.flower.growth_units > (previous.growth[p.flower.id] ?? 0),
    ),
    bloomed,
    fulfilled: state.plants.filter((p) => p.flower.fulfilled_at && !fulfilled.has(p.flower.id)),
    partnerCare: state.plants.filter((p) => partnerCared(state, p) && !cared.has(p.flower.id)),
  };
}

export const hasAwayNews = (news: AwayNews) =>
  news.planted.length + news.grew.length + news.bloomed.length + news.fulfilled.length + news.partnerCare.length > 0;

// Browser storage can be missing, blocked or full; any failure means no news, never false news.
export function readAwaySnapshot(memberId: 1 | 2): { ok: true; snapshot: AwaySnapshot | null } | { ok: false } {
  try {
    return { ok: true, snapshot: parseAwaySnapshot(window.localStorage.getItem(awayKey(memberId))) };
  } catch {
    return { ok: false };
  }
}

export function writeAwaySnapshot(memberId: 1 | 2, snapshot: AwaySnapshot) {
  try {
    window.localStorage.setItem(awayKey(memberId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}
