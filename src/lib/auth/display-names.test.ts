import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { partnerDisplayName } from "./display-names";
afterEach(() => vi.unstubAllEnvs());
it("maps the opposite stable slot without changing spelling or case", () => {
  vi.stubEnv("GARDEN_MEMBER_1_NAME", "  Avery  ");
  vi.stubEnv("GARDEN_MEMBER_2_NAME", "Élodie-Anne");
  expect(partnerDisplayName(1)).toBe("Élodie-Anne");
  expect(partnerDisplayName(2)).toBe("Avery");
});
it.each([undefined, "", "  ", "<script>alert(1)</script>", "A\nB", "A\u202eB", "x".repeat(61), "a@example.test", "https://example.test"])("falls back for absent or unsafe configuration %s", value => {
  vi.stubEnv("GARDEN_MEMBER_2_NAME", value);
  expect(partnerDisplayName(1)).toBeNull();
});
it.each(["O’Neal", "李", "Anne Marie", "A".repeat(60)])("accepts reasonable display name %s", value => {
  vi.stubEnv("GARDEN_MEMBER_2_NAME", value);
  expect(partnerDisplayName(1)).toBe(value);
});
