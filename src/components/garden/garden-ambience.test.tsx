import { act, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { readSettings } = vi.hoisted(() => ({ readSettings: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting: vi.fn() }));
import { MemberPreferences } from "@/components/settings/member-preferences";
import { GardenAmbience, gardenPhase, useGardenLight } from "./garden-ambience";

// Pacific daylight time is UTC-7 on these September dates.
const at = (pacific: string) => Date.parse(`2026-09-18T${pacific}:00-07:00`);
let reduce = false;
beforeEach(() => {
  reduce = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => vi.unstubAllGlobals());

function Ambience({ now, moonflower, gentle }: { now: number; moonflower: boolean; gentle: boolean }) {
  const light = useGardenLight(now, moonflower);
  return (
    <MemberPreferences initial={{ state: { revision: 1, guide: "finished", gentle_motion: gentle }, error: null }}>
      <GardenAmbience light={light} />
    </MemberPreferences>
  );
}
const layer = () => document.querySelector<HTMLElement>("[data-phase]");

it("derives the phase from the Pacific garden clock, with night only in Moonflower hours", () => {
  expect(gardenPhase(at("04:00"), false).phase).toBe("dawn");
  expect(gardenPhase(at("07:59"), false).phase).toBe("dawn");
  expect(gardenPhase(at("08:00"), false).phase).toBe("day");
  expect(gardenPhase(at("16:59"), false).phase).toBe("day");
  expect(gardenPhase(at("17:00"), false).phase).toBe("golden");
  expect(gardenPhase(at("20:00"), false).phase).toBe("dusk");
  expect(gardenPhase(at("22:00"), true).phase).toBe("night");
  expect(gardenPhase(at("03:59"), true)).toEqual({ phase: "night", minute: 239 });
  // Until the next garden read confirms the Moonflower window, night waits.
  expect(gardenPhase(at("22:00"), false).phase).toBe("dusk");
  expect(gardenPhase(at("04:00"), true).phase).toBe("night");
});

it("server-renders a neutral garden and hydrates into the phase without warnings", async () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const tree = <Ambience now={at("23:30")} moonflower gentle />;
  const html = renderToString(tree);
  expect(html).not.toContain("data-phase");
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const recoverable = vi.fn();
  const root = await act(async () => hydrateRoot(container, tree, { onRecoverableError: recoverable }));
  expect(container.querySelector("[data-phase]")).toHaveAttribute("data-phase", "night");
  expect(errors).not.toHaveBeenCalled();
  expect(recoverable).not.toHaveBeenCalled();
  act(() => root.unmount());
  container.remove();
  errors.mockRestore();
});

it("stays decorative: hidden from assistive technology and never focusable", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  render(<Ambience now={at("23:30")} moonflower gentle />);
  const ambience = layer()!;
  expect(ambience).toHaveAttribute("aria-hidden", "true");
  expect(ambience.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
});

it("moves fireflies at night and petals by day while motion is allowed", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("23:30")} moonflower gentle />);
  expect(layer()).toHaveAttribute("data-motion", "live");
  expect(document.querySelectorAll("[data-firefly]").length).toBeGreaterThan(0);
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
  view.rerender(<Ambience now={at("12:30")} moonflower={false} gentle />);
  expect(layer()).toHaveAttribute("data-phase", "day");
  expect(document.querySelectorAll("[data-firefly]")).toHaveLength(0);
  expect(document.querySelectorAll("[data-petal]").length).toBeGreaterThan(0);
});

it("stops all ambience motion when the member turns gentle motion off", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("23:30")} moonflower gentle={false} />);
  expect(layer()).toHaveAttribute("data-motion", "still");
  // Fireflies remain as static glows; drifting petals are removed.
  expect(document.querySelectorAll("[data-firefly]").length).toBeGreaterThan(0);
  view.rerender(<Ambience now={at("12:30")} moonflower={false} gentle={false} />);
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
});

it("stops all ambience motion under the device reduced-motion setting", () => {
  reduce = true;
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("12:30")} moonflower={false} gentle />);
  expect(layer()).toHaveAttribute("data-motion", "still");
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
  view.rerender(<Ambience now={at("23:30")} moonflower gentle />);
  expect(layer()).toHaveAttribute("data-motion", "still");
  expect(document.querySelectorAll("[data-firefly]").length).toBeGreaterThan(0);
});
