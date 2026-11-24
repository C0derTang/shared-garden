import { describe, expect, it } from "vitest";
import { skyStateAt, solarPosition, sunDirection } from "./solar";

// Instants in America/Los_Angeles on the June solstice (PDT, UTC-7) and the
// December solstice (PST, UTC-8).
const june = (time: string) => new Date(`2026-06-21T${time}:00-07:00`);
const december = (time: string) => new Date(`2026-12-21T${time}:00-08:00`);

describe("solarPosition", () => {
  it("puts the summer noon sun high in the south", () => {
    const noon = solarPosition(june("13:00"));
    expect(noon.elevation).toBeGreaterThan(75);
    expect(noon.elevation).toBeLessThan(81);
    expect(noon.azimuth).toBeGreaterThan(150);
    expect(noon.azimuth).toBeLessThan(220);
  });

  it("puts the winter noon sun low in the south", () => {
    const noon = solarPosition(december("12:00"));
    expect(noon.elevation).toBeGreaterThan(29);
    expect(noon.elevation).toBeLessThan(35);
  });

  it("rises in the east and sets in the west", () => {
    expect(solarPosition(june("06:00")).azimuth).toBeLessThan(90);
    expect(solarPosition(june("20:00")).azimuth).toBeGreaterThan(270);
  });
});

describe("skyStateAt", () => {
  it.each([
    [june("03:00"), "night"],
    [june("05:50"), "dawn"],
    [june("12:00"), "day"],
    [june("20:05"), "dusk"],
    [june("23:30"), "night"],
    [december("07:05"), "dawn"],
    [december("16:50"), "dusk"],
    [december("18:30"), "night"],
  ] as const)("maps %s to %s", (date, phase) => {
    expect(skyStateAt(date).phase).toBe(phase);
  });

  it("distinguishes morning from evening twilight", () => {
    expect(skyStateAt(june("05:50")).morning).toBe(true);
    expect(skyStateAt(june("20:05")).morning).toBe(false);
  });
});

describe("sunDirection", () => {
  it("faces the camera (west, -z) at sunset and north is to the right", () => {
    const sunset = sunDirection({ elevation: 0, azimuth: 270 });
    expect(sunset[2]).toBeCloseTo(-1);
    const north = sunDirection({ elevation: 0, azimuth: 0 });
    expect(north[0]).toBeCloseTo(1);
    const zenith = sunDirection({ elevation: 90, azimuth: 123 });
    expect(zenith[1]).toBeCloseTo(1);
  });

  it("returns unit vectors", () => {
    const d = sunDirection(solarPosition(june("09:15")));
    expect(Math.hypot(...d)).toBeCloseTo(1);
  });
});
