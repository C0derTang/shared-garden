import { solarPosition } from "@/lib/world/solar";
import type { DayAwardsV2 } from "./achievements";

/**
 * When the night fireworks play (#184, decision 0067): after the real
 * America/Los_Angeles sunset, until the next 4 a.m. garden-day rollover, on a
 * garden day during which any new-garden achievement was earned. Each member
 * sees the show play by itself once per night (remembered in this browser);
 * after that it plays only from the replay control.
 */

const TIME_ZONE = "America/Los_Angeles";
/** Garden days roll over at 4 a.m. Los Angeles wall time. */
export const ROLLOVER_HOUR = 4;
/** Sunset: the sun's upper limb on the horizon, with refraction (degrees). */
export const SUNSET_ELEVATION = -0.833;

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

interface WallTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
}

/** Los Angeles wall-clock date and hour of an instant (DST-aware). */
function wallTime(ms: number): WallTime {
  const parts: Record<string, number> = {};
  for (const part of wallClock.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number.parseInt(part.value, 10);
  }
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour! % 24 };
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** The garden day (YYYY-MM-DD) an instant belongs to: the Los Angeles date, until 4 a.m. the previous one. */
export function gardenDayAt(ms: number): string {
  const wall = wallTime(ms);
  return isoDate(wall.year, wall.month, wall.hour < ROLLOVER_HOUR ? wall.day - 1 : wall.day);
}

export interface FireworksNight {
  /** True from the garden day's sunset until the next 4 a.m. rollover. */
  readonly night: boolean;
  /** The garden day the instant belongs to. */
  readonly gardenDay: string;
}

/**
 * Whether an instant is in the fireworks night of its garden day. The sun is
 * the world sky's own (the generic Los Angeles reference point). Between 4
 * a.m. and noon the sun is rising, so a dark sky there is the new day's dawn,
 * not the night; from midnight to 4 a.m. it is always the same night.
 */
export function fireworksNightAt(ms: number): FireworksNight {
  const wall = wallTime(ms);
  const gardenDay = isoDate(wall.year, wall.month, wall.hour < ROLLOVER_HOUR ? wall.day - 1 : wall.day);
  if (wall.hour < ROLLOVER_HOUR) return { night: true, gardenDay };
  if (wall.hour < 12) return { night: false, gardenDay };
  return { night: solarPosition(new Date(ms)).elevation < SUNSET_ELEVATION, gardenDay };
}

/** The awards that light a night's fireworks, as fetched for one garden day. */
export interface NightAwards {
  readonly day: string;
  readonly titles: readonly string[];
}

/** Keeps only awards earned on the requested garden day (in earned order). */
export function nightAwardsFrom(result: DayAwardsV2, day: string): NightAwards {
  return { day, titles: result.awards.filter((award) => award.earned_day === day).map((award) => award.title) };
}

/** What the garden should do with the fireworks right now. */
export interface FireworksPlan {
  /** Night, and an award was earned this garden day: the show (and its replay) is available. */
  readonly eligible: boolean;
  /** Play it by itself now: eligible and not yet seen this night in this browser. */
  readonly autoplay: boolean;
  readonly gardenDay: string;
  /** Titles of the achievements earned this garden day. */
  readonly titles: readonly string[];
}

/**
 * Decides the fireworks for an instant. `seenDay` is the garden day whose show
 * this member last saw in this browser; `null` when never, `undefined` when
 * that memory cannot be read (then the show never plays by itself, so it can
 * not repeat every visit, but the replay control still offers it).
 */
export function planFireworks(ms: number, awards: NightAwards | null, seenDay: string | null | undefined): FireworksPlan {
  const { night, gardenDay } = fireworksNightAt(ms);
  const titles = awards && awards.day === gardenDay ? awards.titles : [];
  const eligible = night && titles.length > 0;
  return { eligible, autoplay: eligible && seenDay !== undefined && seenDay !== gardenDay, gardenDay, titles };
}

/** The gentle caption naming what was earned. */
export function fireworksCaption(titles: readonly string[]): string {
  if (titles.length === 0) return "";
  const list =
    titles.length === 1 ? titles[0]! : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]!}`;
  return `for today’s ${titles.length === 1 ? "achievement" : "achievements"}: ${list}`;
}

const storageKey = (memberId: number) => `garden-v2:fireworks:${memberId}`;

/**
 * The garden day whose fireworks this member last saw in this browser: `null`
 * when never, `undefined` when local storage cannot be read.
 */
export function readFireworksSeen(memberId: number): string | null | undefined {
  try {
    const raw = window.localStorage.getItem(storageKey(memberId));
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    const day = parsed && typeof parsed === "object" ? (parsed as { day?: unknown }).day : undefined;
    return typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  } catch {
    return undefined;
  }
}

/** Remembers that this member saw the given garden day's fireworks. */
export function writeFireworksSeen(memberId: number, gardenDay: string): void {
  try {
    window.localStorage.setItem(storageKey(memberId), JSON.stringify({ day: gardenDay }));
  } catch {
    // Unwritable storage: the show may play by itself again on a later visit.
  }
}

/** A stable show seed for a garden day (each replay varies it). */
export function fireworksSeed(gardenDay: string, replay = 0): number {
  let hash = 2166136261;
  for (const char of `${gardenDay}#${replay}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
