import { expect, it } from "vitest";
import { civilTwilight, horizon, solarDay, sunPosition, sunTimes } from "./solar";

// Published Los Angeles (34.05°N, 118.24°W) times, to the minute.
const cases = [
  // Winter solstice (PST).
  { date: "2025-12-21", offset: "-08:00", sunrise: "06:55", sunset: "16:48" },
  // Summer solstice (PDT).
  { date: "2026-06-21", offset: "-07:00", sunrise: "05:42", sunset: "20:08" },
  // Either side of the spring DST change (8 March 2026).
  { date: "2026-03-07", offset: "-08:00", sunrise: "06:14", sunset: "17:54" },
  { date: "2026-03-08", offset: "-07:00", sunrise: "07:12", sunset: "18:55" },
  // Either side of the autumn DST change (1 November 2026).
  { date: "2026-10-31", offset: "-07:00", sunrise: "07:12", sunset: "18:01" },
  { date: "2026-11-01", offset: "-08:00", sunrise: "06:13", sunset: "17:00" },
];
const local = (date: string, time: string, offset: string) => Date.parse(`${date}T${time}:00${offset}`);
const minutes = (ms: number) => Math.abs(ms) / 60_000;

it("matches published Los Angeles sunrise and sunset through the seasons and DST, within 3 minutes", () => {
  for (const { date, offset, sunrise, sunset } of cases) {
    const times = sunTimes(solarDay(local(date, "12:00", offset)));
    expect(minutes(times.sunrise - local(date, sunrise, offset))).toBeLessThan(3);
    expect(minutes(times.sunset - local(date, sunset, offset))).toBeLessThan(3);
  }
});

it("puts the sun at the horizon at sunrise, at civil twilight 6° below it, and due south at noon", () => {
  const times = sunTimes(solarDay(local("2026-09-27", "12:00", "-07:00")));
  expect(sunPosition(times.sunrise).elevation).toBeCloseTo(horizon, 1);
  expect(sunPosition(times.sunset).elevation).toBeCloseTo(horizon, 1);
  expect(sunPosition(times.civilDawn).elevation).toBeCloseTo(civilTwilight, 1);
  expect(sunPosition(times.civilDusk).elevation).toBeCloseTo(civilTwilight, 1);
  expect(sunPosition(times.noon).azimuth).toBeCloseTo(180, 0);
  expect(sunPosition(times.sunrise).azimuth).toBeLessThan(180);
  expect(sunPosition(times.sunset).azimuth).toBeGreaterThan(180);
  expect(times.civilDawn).toBeLessThan(times.sunrise);
  expect(times.sunset).toBeLessThan(times.civilDusk);
});

it("keeps a whole Pacific night on the solar day that began the previous noon", () => {
  // 00:20 PDT belongs to the solar day of the previous afternoon.
  const lateNight = local("2026-09-27", "00:20", "-07:00");
  expect(solarDay(lateNight)).toBe(solarDay(local("2026-09-26", "18:00", "-07:00")));
  expect(solarDay(local("2026-09-27", "05:00", "-07:00"))).toBe(solarDay(local("2026-09-27", "18:00", "-07:00")));
  expect(sunPosition(lateNight).elevation).toBeLessThan(civilTwilight);
});
