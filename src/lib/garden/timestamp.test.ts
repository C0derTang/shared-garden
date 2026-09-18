import { expect, it } from "vitest";
import { compareTimestamps } from "./timestamp";
it("normalizes offsets and fractional widths without rounding versions", () => {
  expect(compareTimestamps("2026-09-18T10:01:00.0001-07:00", "2026-09-18T17:01:00.000900+00:00")).toBeLessThan(0);
  expect(compareTimestamps("2026-09-18T18:01:00.100000+01:00", "2026-09-18T17:01:00.1Z")).toBe(0);
  expect(compareTimestamps("2026-09-18T17:01:01Z", "2026-09-18T17:01:00.999999Z")).toBeGreaterThan(0);
  expect(compareTimestamps("2026-09-18T17:01:00.000900Z", "2026-09-18T17:01:00.000100Z")).toBeGreaterThan(0);
});
