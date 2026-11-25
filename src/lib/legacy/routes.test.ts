import { expect, it } from "vitest";
import { legacyPanel, legacyPanelFromHref, legacyPanelHref } from "./routes";

it("names each legacy panel by an in-page query on /legacy", () => {
  expect(legacyPanelHref("memories")).toBe("/legacy?panel=memories");
  expect(legacyPanelHref("songs")).toBe("/legacy?panel=songs");
});

it("recognizes only known panels", () => {
  expect(legacyPanel("settings")).toBe("settings");
  for (const value of [undefined, null, "", "garden", "toString", "constructor", ["memories"]])
    expect(legacyPanel(value)).toBeNull();
});

it("reads the panel an in-app link opens", () => {
  expect(legacyPanelFromHref("/legacy?panel=achievements")).toBe("achievements");
  expect(legacyPanelFromHref("/legacy")).toBeNull();
  expect(legacyPanelFromHref("/legacy?spot=2")).toBeNull();
  expect(legacyPanelFromHref("/garden?panel=memories")).toBeNull();
  expect(legacyPanelFromHref("/memories")).toBeNull();
});
