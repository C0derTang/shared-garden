import { afterEach, describe, expect, it, vi } from "vitest";
import { solarPosition } from "@/lib/world/solar";
import type { DayAwardsV2 } from "./achievements";
import {
  SUNSET_ELEVATION,
  fireworksCaption,
  fireworksNightAt,
  fireworksSeed,
  gardenDayAt,
  nightAwardsFrom,
  planFireworks,
  readFireworksSeen,
  writeFireworksSeen,
  type NightAwards,
} from "./fireworks";

const at = (iso: string) => Date.parse(iso);

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("garden day", () => {
  it("rolls over at 4 a.m. Los Angeles time", () => {
    expect(gardenDayAt(at("2026-11-25T03:59:59-08:00"))).toBe("2026-11-24");
    expect(gardenDayAt(at("2026-11-25T04:00:00-08:00"))).toBe("2026-11-25");
    expect(gardenDayAt(at("2026-11-24T23:30:00-08:00"))).toBe("2026-11-24");
    // Month and year boundaries.
    expect(gardenDayAt(at("2027-01-01T01:00:00-08:00"))).toBe("2026-12-31");
    expect(gardenDayAt(at("2026-12-01T02:00:00-08:00"))).toBe("2026-11-30");
  });

  it("follows daylight saving time on both transitions", () => {
    // Spring forward (8 March 2026, 2 a.m. PST becomes 3 a.m. PDT).
    expect(gardenDayAt(at("2026-03-08T01:30:00-08:00"))).toBe("2026-03-07");
    expect(gardenDayAt(at("2026-03-08T03:30:00-07:00"))).toBe("2026-03-07");
    expect(gardenDayAt(at("2026-03-08T04:00:00-07:00"))).toBe("2026-03-08");
    // 4 a.m. PST would be 5 a.m. PDT: already the new day.
    expect(gardenDayAt(at("2026-03-08T12:00:00Z"))).toBe("2026-03-08");
    // Fall back (1 November 2026, 1:30 a.m. happens twice).
    expect(gardenDayAt(at("2026-11-01T01:30:00-07:00"))).toBe("2026-10-31");
    expect(gardenDayAt(at("2026-11-01T01:30:00-08:00"))).toBe("2026-10-31");
    expect(gardenDayAt(at("2026-11-01T03:59:00-08:00"))).toBe("2026-10-31");
    expect(gardenDayAt(at("2026-11-01T04:00:00-08:00"))).toBe("2026-11-01");
  });
});

describe("fireworks night", () => {
  it("starts at the real sunset, by the world sky's sun", () => {
    // Late November: sunset is about 4:45 p.m. PST.
    expect(fireworksNightAt(at("2026-11-24T16:15:00-08:00"))).toEqual({ night: false, gardenDay: "2026-11-24" });
    expect(fireworksNightAt(at("2026-11-24T17:15:00-08:00"))).toEqual({ night: true, gardenDay: "2026-11-24" });
    // Midsummer: sunset is about 8:08 p.m. PDT.
    expect(fireworksNightAt(at("2026-06-21T19:45:00-07:00")).night).toBe(false);
    expect(fireworksNightAt(at("2026-06-21T20:30:00-07:00")).night).toBe(true);
  });

  it("matches the sun crossing the horizon to within a minute", () => {
    // Find the evening crossing by scanning, then check either side of it.
    let t = at("2026-11-24T16:00:00-08:00");
    while (solarPosition(new Date(t)).elevation >= SUNSET_ELEVATION) t += 60_000;
    expect(fireworksNightAt(t - 60_000).night).toBe(false);
    expect(fireworksNightAt(t).night).toBe(true);
  });

  it("lasts until the next 4 a.m. rollover and stays the same garden day", () => {
    expect(fireworksNightAt(at("2026-11-24T23:59:00-08:00"))).toEqual({ night: true, gardenDay: "2026-11-24" });
    expect(fireworksNightAt(at("2026-11-25T01:00:00-08:00"))).toEqual({ night: true, gardenDay: "2026-11-24" });
    expect(fireworksNightAt(at("2026-11-25T03:59:59-08:00"))).toEqual({ night: true, gardenDay: "2026-11-24" });
    // After the rollover the sky is still dark, but it is the new day's dawn.
    expect(fireworksNightAt(at("2026-11-25T04:00:00-08:00"))).toEqual({ night: false, gardenDay: "2026-11-25" });
    expect(fireworksNightAt(at("2026-11-25T06:00:00-08:00"))).toEqual({ night: false, gardenDay: "2026-11-25" });
  });

  it("is not fooled by solar midnight falling before local midnight in winter", () => {
    // Around 11:40 p.m. PST in early November the sun has passed its lowest point.
    expect(fireworksNightAt(at("2026-11-03T23:50:00-08:00"))).toEqual({ night: true, gardenDay: "2026-11-03" });
  });

  it("keeps the night across daylight saving transitions", () => {
    // Spring forward: 3:30 a.m. PDT on 8 March is still the night of 7 March.
    expect(fireworksNightAt(at("2026-03-08T03:30:00-07:00"))).toEqual({ night: true, gardenDay: "2026-03-07" });
    expect(fireworksNightAt(at("2026-03-08T04:00:00-07:00"))).toEqual({ night: false, gardenDay: "2026-03-08" });
    // Fall back: both 1:30 a.m.s belong to the night of 31 October; 4 a.m. PST ends it.
    expect(fireworksNightAt(at("2026-11-01T01:30:00-07:00"))).toEqual({ night: true, gardenDay: "2026-10-31" });
    expect(fireworksNightAt(at("2026-11-01T01:30:00-08:00"))).toEqual({ night: true, gardenDay: "2026-10-31" });
    expect(fireworksNightAt(at("2026-11-01T04:00:00-08:00"))).toEqual({ night: false, gardenDay: "2026-11-01" });
    // The first evening of daylight time: sunset near 7:03 p.m. PDT.
    expect(fireworksNightAt(at("2026-03-08T18:40:00-07:00")).night).toBe(false);
    expect(fireworksNightAt(at("2026-03-08T19:30:00-07:00")).night).toBe(true);
  });
});

describe("planning the fireworks", () => {
  const evening = at("2026-11-24T20:00:00-08:00");
  const afternoon = at("2026-11-24T14:00:00-08:00");
  const lateNight = at("2026-11-25T01:00:00-08:00");
  const today: NightAwards = { day: "2026-11-24", titles: ["First seed planted"] };

  it("plays once by itself on a night after an achievement", () => {
    expect(planFireworks(evening, today, null)).toEqual({ eligible: true, autoplay: true, gardenDay: "2026-11-24", titles: ["First seed planted"] });
    // At 1 a.m. the garden day is still the previous calendar day.
    expect(planFireworks(lateNight, today, null).autoplay).toBe(true);
    // A show seen on an earlier night does not count.
    expect(planFireworks(evening, today, "2026-11-23").autoplay).toBe(true);
  });

  it("only offers the replay after this member saw tonight's show", () => {
    expect(planFireworks(evening, today, "2026-11-24")).toMatchObject({ eligible: true, autoplay: false });
    expect(planFireworks(lateNight, today, "2026-11-24")).toMatchObject({ eligible: true, autoplay: false });
  });

  it("plays nothing without an award earned this garden day", () => {
    expect(planFireworks(evening, null, null)).toMatchObject({ eligible: false, autoplay: false });
    expect(planFireworks(evening, { day: "2026-11-24", titles: [] }, null)).toMatchObject({ eligible: false, autoplay: false });
    // Yesterday's awards do not light tonight.
    expect(planFireworks(evening, { day: "2026-11-23", titles: ["Seven-day streak"] }, null)).toMatchObject({ eligible: false, titles: [] });
    // After the 4 a.m. rollover, the night's awards belong to the previous day.
    expect(planFireworks(at("2026-11-25T04:30:00-08:00"), today, null)).toMatchObject({ eligible: false, autoplay: false });
  });

  it("plays nothing in daylight, even with an award", () => {
    expect(planFireworks(afternoon, today, null)).toMatchObject({ eligible: false, autoplay: false });
    expect(planFireworks(at("2026-11-24T16:15:00-08:00"), today, null)).toMatchObject({ eligible: false });
  });

  it("never plays by itself when this browser cannot remember", () => {
    expect(planFireworks(evening, today, undefined)).toMatchObject({ eligible: true, autoplay: false });
  });

  it("keeps only awards earned on the requested day", () => {
    const result: DayAwardsV2 = {
      server_now: "2026-11-25T04:00:00Z",
      garden_day: "2026-11-24",
      day: "2026-11-24",
      earned: true,
      awards: [
        { achievement_id: "first-seed", title: "First seed planted", earned_at: "2026-11-24T18:00:00Z", earned_day: "2026-11-24" },
        { achievement_id: "stray", title: "Stray", earned_at: "2026-11-23T18:00:00Z", earned_day: "2026-11-23" },
        { achievement_id: "first-bloom", title: "First bloom", earned_at: "2026-11-25T03:00:00Z", earned_day: "2026-11-24" },
      ],
    };
    expect(nightAwardsFrom(result, "2026-11-24")).toEqual({ day: "2026-11-24", titles: ["First seed planted", "First bloom"] });
  });
});

describe("remembering the show", () => {
  it("remembers per member and garden day", () => {
    expect(readFireworksSeen(1)).toBeNull();
    writeFireworksSeen(1, "2026-11-24");
    expect(readFireworksSeen(1)).toBe("2026-11-24");
    expect(readFireworksSeen(2)).toBeNull();
    expect(planFireworks(at("2026-11-24T21:00:00-08:00"), { day: "2026-11-24", titles: ["A"] }, readFireworksSeen(1)).autoplay).toBe(false);
    expect(planFireworks(at("2026-11-24T21:00:00-08:00"), { day: "2026-11-24", titles: ["A"] }, readFireworksSeen(2)).autoplay).toBe(true);
    // The next night it plays again.
    expect(planFireworks(at("2026-11-25T21:00:00-08:00"), { day: "2026-11-25", titles: ["A"] }, readFireworksSeen(1)).autoplay).toBe(true);
  });

  it("treats a malformed memory as never seen and unreadable storage as unknown", () => {
    window.localStorage.setItem("garden-v2:fireworks:1", "not json");
    expect(readFireworksSeen(1)).toBeUndefined();
    window.localStorage.setItem("garden-v2:fireworks:1", JSON.stringify({ day: 42 }));
    expect(readFireworksSeen(1)).toBeNull();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readFireworksSeen(1)).toBeUndefined();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeFireworksSeen(1, "2026-11-24")).not.toThrow();
  });
});

describe("caption and seed", () => {
  it("names what was earned", () => {
    expect(fireworksCaption([])).toBe("");
    expect(fireworksCaption(["First seed planted"])).toBe("for today’s achievement: First seed planted");
    expect(fireworksCaption(["A", "B", "C"])).toBe("for today’s achievements: A, B and C");
  });

  it("is stable for a day and varies per replay", () => {
    expect(fireworksSeed("2026-11-24")).toBe(fireworksSeed("2026-11-24"));
    expect(fireworksSeed("2026-11-24", 1)).not.toBe(fireworksSeed("2026-11-24", 2));
    expect(fireworksSeed("2026-11-24")).not.toBe(fireworksSeed("2026-11-25"));
  });
});
