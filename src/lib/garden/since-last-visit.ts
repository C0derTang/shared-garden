import type { CatalogItem, GardenState, Plant } from "./model";

/**
 * Since-last-visit snapshot (decision 0054). It is kept in this browser only,
 * per garden and member, and holds ids, type keys and the garden day, never
 * entry text, wishes, media or other private content.
 */
export type VisitSnapshot = {
  v: 1;
  /** Flower ids that had a first bloom. */
  blooms: string[];
  /** Unlocked flower type keys. */
  unlocks: string[];
  /** The garden day that `partnerCare` belongs to. */
  careDay: string;
  /** Flower ids your partner had cared for on `careDay`. */
  partnerCare: string[];
  /** Earned achievement ids, or null until achievements have loaded once. */
  badges: string[] | null;
  /** Earned achievement ids already seen in the Achievements panel. */
  badgesViewed: string[] | null;
  /**
   * The viewer acted and no achievements read has succeeded since, so the
   * next successful read only moves the badge baseline.
   */
  badgesPending?: boolean;
  /**
   * News found while the garden guide held the card (decision 0056), waiting
   * to be shown once. Ids and type keys only, deduplicated and capped at
   * `pendingLimit` in total.
   */
  pending?: PendingNews;
};
export type PendingNews = { blooms: string[]; unlocks: string[]; partnerCare: string[]; badges: string[] };
export const pendingLimit = 20;
export type EarnedBadge = { id: string; title: string };
export type VisitNews = {
  blooms: Plant[];
  unlocks: CatalogItem[];
  partnerCare: Plant[];
  badges: EarnedBadge[];
};
export const noNews: VisitNews = { blooms: [], unlocks: [], partnerCare: [], badges: [] };

export function snapshotKey(state: Pick<GardenState, "member_id" | "garden">) {
  return `ccsgarden:since-last-visit:v1:${state.garden.id}:${state.member_id}`;
}

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const nullableStrings = (value: unknown): value is string[] | null =>
  value === null || strings(value);

function validPending(value: unknown): value is PendingNews {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lists = value as Partial<PendingNews>;
  return strings(lists.blooms) && strings(lists.unlocks) && strings(lists.partnerCare) && strings(lists.badges) &&
    lists.blooms.length + lists.unlocks.length + lists.partnerCare.length + lists.badges.length <= pendingLimit;
}

/** Anything unreadable counts as no snapshot, so it never celebrates. */
export function parseSnapshot(raw: string | null): VisitSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<VisitSnapshot> | null;
    if (
      value?.v === 1 &&
      strings(value.blooms) &&
      strings(value.unlocks) &&
      typeof value.careDay === "string" &&
      strings(value.partnerCare) &&
      nullableStrings(value.badges) &&
      nullableStrings(value.badgesViewed) &&
      (value.badgesPending === undefined || typeof value.badgesPending === "boolean") &&
      (value.pending === undefined || validPending(value.pending))
    )
      return value as VisitSnapshot;
  } catch {
    // Unreadable JSON is treated like a first visit.
  }
  return null;
}

const partnerCared = (state: GardenState, plant: Plant) =>
  !(plant.flower.type_key === "hydrangea" && plant.flower.first_bloom_at) &&
  (state.member_id === 1 ? plant.member2_submitted : plant.member1_submitted);

/**
 * The snapshot after this visit. Badges keep their previous value until the
 * achievements read succeeds, and the first successful read marks every
 * earned badge as already viewed, so nothing is new on a first visit.
 */
export function takeSnapshot(
  state: GardenState,
  badges: EarnedBadge[] | null,
  previous: VisitSnapshot | null,
): VisitSnapshot {
  const earned = badges ? badges.map((badge) => badge.id) : null;
  return {
    v: 1,
    blooms: state.plants.filter((p) => p.flower.first_bloom_at).map((p) => p.flower.id),
    unlocks: state.unlocks.map((u) => u.type_key),
    careDay: state.garden_day,
    partnerCare: state.plants.filter((p) => partnerCared(state, p)).map((p) => p.flower.id),
    badges: earned ?? previous?.badges ?? null,
    badgesViewed: previous?.badgesViewed ?? earned,
    badgesPending: previous?.badgesPending ?? false,
  };
}

/** What happened since `previous`. With no snapshot, nothing is new. */
export function diffSnapshot(
  previous: VisitSnapshot | null,
  state: GardenState,
  badges: EarnedBadge[] | null,
): VisitNews {
  if (!previous) return noNews;
  const blooms = new Set(previous.blooms);
  const unlocks = new Set(previous.unlocks);
  // Entries arrive for the current garden day only. After a rollover every
  // partner care on the new day happened since the snapshot.
  const cared = new Set(previous.careDay === state.garden_day ? previous.partnerCare : []);
  const earned = new Set(previous.badges ?? []);
  return {
    blooms: state.plants.filter((p) => p.flower.first_bloom_at && !blooms.has(p.flower.id)),
    unlocks: state.catalog.filter(
      (item) => !unlocks.has(item.type_key) && state.unlocks.some((u) => u.type_key === item.type_key),
    ),
    partnerCare: state.plants.filter((p) => partnerCared(state, p) && !cared.has(p.flower.id)),
    badges: previous.badges && badges ? badges.filter((badge) => !earned.has(badge.id)) : [],
  };
}

export const hasNews = (news: VisitNews) =>
  news.blooms.length + news.unlocks.length + news.partnerCare.length + news.badges.length > 0;

function union<T>(old: T[], next: T[], id: (item: T) => string) {
  const seen = new Set(old.map(id));
  return [...old, ...next.filter((item) => !seen.has(id(item)))];
}
/** Adds news that arrived while the card was open, without repeating a line. */
export function mergeNews(old: VisitNews, next: VisitNews): VisitNews {
  return {
    blooms: union(old.blooms, next.blooms, (p) => p.flower.id),
    unlocks: union(old.unlocks, next.unlocks, (u) => u.type_key),
    partnerCare: union(old.partnerCare, next.partnerCare, (p) => p.flower.id),
    badges: union(old.badges, next.badges, (b) => b.id),
  };
}

/** Earned badges the Achievements panel has not shown yet. */
export function unreadBadges(snapshot: VisitSnapshot | null) {
  if (!snapshot?.badges || !snapshot.badgesViewed) return 0;
  const viewed = new Set(snapshot.badgesViewed);
  return snapshot.badges.filter((id) => !viewed.has(id)).length;
}

/**
 * A short signature of the garden facts achievements depend on, so the
 * achievements read repeats only when one of them changes, not on every poll.
 */
export function badgeSignature(state: GardenState) {
  const entries = state.plants.reduce((sum, p) => sum + p.entries.length, 0);
  const fulfilled = state.plants.filter((p) => p.flower.fulfilled_at).length;
  const blooms = state.plants.filter((p) => p.flower.first_bloom_at).length;
  const { current_streak, qualifying_days } = state.garden;
  return [state.garden_day, state.plants.length, blooms, fulfilled, entries, current_streak, qualifying_days].join("|");
}

/** Joins names as "Rose", "Rose and Tulip" or "Rose, Tulip and 2 more". */
export function nameList(names: string[]) {
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  const labels = [...counts].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name));
  if (labels.length <= 2) return labels.join(" and ");
  if (labels.length === 3) return `${labels[0]}, ${labels[1]} and ${labels[2]}`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}

// Browser storage can be missing, blocked or full. Every access is guarded,
// and any failure means no celebration rather than a false one.
export function readStoredSnapshot(key: string): { ok: true; snapshot: VisitSnapshot | null } | { ok: false } {
  try {
    const storage = window.localStorage;
    if (!storage) return { ok: false };
    return { ok: true, snapshot: parseSnapshot(storage.getItem(key)) };
  } catch {
    return { ok: false };
  }
}
export function writeStoredSnapshot(key: string, snapshot: VisitSnapshot) {
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

// A tiny shared store feeds the unread badge dot on the Achievements hotbar
// slot, which lives outside the garden client.
type BadgeStore = { key: string | null; unread: number };
let badgeStore: BadgeStore = { key: null, unread: 0 };
const badgeListeners = new Set<() => void>();
export function publishBadges(next: BadgeStore) {
  if (next.key === badgeStore.key && next.unread === badgeStore.unread) return;
  badgeStore = next;
  badgeListeners.forEach((listener) => listener());
}
export function subscribeBadges(listener: () => void) {
  badgeListeners.add(listener);
  return () => void badgeListeners.delete(listener);
}
export const unreadBadgeCount = () => badgeStore.unread;
/** Records every earned badge as seen once the Achievements panel is open. */
export function markBadgesViewed() {
  const { key } = badgeStore;
  if (!key) return;
  const stored = readStoredSnapshot(key);
  if (!stored.ok || !stored.snapshot?.badges) return;
  if (writeStoredSnapshot(key, { ...stored.snapshot, badgesViewed: stored.snapshot.badges }))
    publishBadges({ key, unread: 0 });
}

/**
 * Adds news that would have been shown to the waiting list: ids only, no
 * repeats, and at most `pendingLimit` entries, keeping the earliest.
 */
export function addPending(pending: PendingNews | undefined, news: VisitNews): PendingNews | undefined {
  const next: PendingNews = {
    blooms: [...(pending?.blooms ?? [])],
    unlocks: [...(pending?.unlocks ?? [])],
    partnerCare: [...(pending?.partnerCare ?? [])],
    badges: [...(pending?.badges ?? [])],
  };
  let room = pendingLimit - (next.blooms.length + next.unlocks.length + next.partnerCare.length + next.badges.length);
  const add = (list: string[], ids: string[]) => {
    for (const id of ids) if (room > 0 && !list.includes(id)) { list.push(id); room--; }
  };
  add(next.blooms, news.blooms.map((p) => p.flower.id));
  add(next.unlocks, news.unlocks.map((u) => u.type_key));
  add(next.partnerCare, news.partnerCare.map((p) => p.flower.id));
  add(next.badges, news.badges.map((b) => b.id));
  return next.blooms.length + next.unlocks.length + next.partnerCare.length + next.badges.length ? next : undefined;
}

/**
 * Turns waiting ids back into news from the current garden. Flowers that are
 * gone are skipped. Badges wait until achievements have loaded, since their
 * names come from that read; those ids are returned as still waiting.
 */
export function resolvePending(
  pending: PendingNews | undefined,
  state: GardenState,
  badges: EarnedBadge[] | null,
): { news: VisitNews; waiting: PendingNews | undefined } {
  if (!pending) return { news: noNews, waiting: undefined };
  const plants = new Map(state.plants.map((p) => [p.flower.id, p]));
  const pick = (ids: string[]) => ids.flatMap((id) => plants.get(id) ?? []);
  const titles = new Map((badges ?? []).map((b) => [b.id, b]));
  return {
    news: {
      blooms: pick(pending.blooms),
      unlocks: state.catalog.filter((item) => pending.unlocks.includes(item.type_key)),
      partnerCare: pick(pending.partnerCare),
      badges: badges ? pending.badges.flatMap((id) => titles.get(id) ?? []) : [],
    },
    waiting: !badges && pending.badges.length ? { blooms: [], unlocks: [], partnerCare: [], badges: pending.badges } : undefined,
  };
}
