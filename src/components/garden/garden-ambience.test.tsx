import { act, render } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { readSettings } = vi.hoisted(() => ({ readSettings: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting: vi.fn() }));
import { MemberPreferences } from "@/components/settings/member-preferences";
import { alongTrack, celestialProgress, GardenAmbience, gardenPhase, skyTrack, useGardenLight } from "./garden-ambience";

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

// Measured 320 and 390px layouts: header bottom (with its shadow) 72, signs 66–110.
const help = (right: number) => ({ left: 12, top: 66, right, bottom: 110 });
const songs = (left: number, right: number) => ({ left, top: 66, right, bottom: 110 });
const clears = (track: NonNullable<ReturnType<typeof skyTrack>>, boxes: { left: number; top: number; right: number; bottom: number }[]) => {
  for (let t = 0; t <= 1; t += 0.01) {
    const { x, y } = alongTrack(track, t);
    for (const b of boxes) {
      const gap = Math.max(b.left - (x + 10), x - 10 - b.right, b.top - (y + 10), y - 10 - b.bottom);
      expect(gap).toBeGreaterThanOrEqual(8);
    }
    expect(y - 10).toBeGreaterThanOrEqual(72);
  }
};

it("keeps the sun and moon in open sky between the signs, clear of every control", () => {
  const boxes = [help(94), songs(281, 378)];
  const track = skyTrack(390, 72, { top: 66, bottom: 110 }, boxes)!;
  expect(track.y).toBe(88);
  expect(track.segments).toEqual([[112, 263]]);
  clears(track, boxes);
  // A centred Guide button splits the row; the disc skips over it.
  const wide = [help(142), { left: 596, top: 66, right: 684, bottom: 110 }, songs(1123, 1220)];
  const split = skyTrack(1280, 72, { top: 66, bottom: 110 }, wide)!;
  expect(split.y).toBe(88);
  expect(split.segments).toHaveLength(3);
  clears(split, wide);
});

it("drops below the signs, around the flowers, when a narrow row has no room", () => {
  const guide = { left: 120, top: 66, right: 200, bottom: 110 };
  const tulip = { left: 230, top: 145, right: 295, bottom: 209 };
  const boxes = [help(94), guide, songs(211, 308), tulip, { left: 26, top: 148, right: 90, bottom: 212 }];
  const track = skyTrack(320, 72, { top: 66, bottom: 110 }, boxes)!;
  expect(track.y).toBe(131);
  expect(track.segments).toEqual([[108, 212]]);
  clears(track, boxes);
});

it("moves the sun from 4 a.m. to 10 p.m. and the moon through Moonflower hours", () => {
  expect(celestialProgress({ phase: "dawn", minute: 240 })).toBe(0);
  expect(celestialProgress({ phase: "day", minute: 780 })).toBe(0.5);
  expect(celestialProgress({ phase: "dusk", minute: 1319 })).toBeCloseTo(1, 2);
  expect(celestialProgress({ phase: "night", minute: 1320 })).toBe(0);
  expect(celestialProgress({ phase: "night", minute: 60 })).toBe(0.5);
  const track = { y: 88, segments: [[10, 20], [40, 50]] as [number, number][] };
  expect(alongTrack(track, 0)).toEqual({ x: 10, y: 88 });
  expect(alongTrack(track, 0.75)).toEqual({ x: 45, y: 88 });
  expect(alongTrack(track, 1)).toEqual({ x: 50, y: 88 });
});

it("yields the sky to the While you were away card when no clear track remains", () => {
  const guide = { left: 124, top: 66, right: 196, bottom: 110 };
  const away = { left: 12, top: 124, right: 308, bottom: 260 };
  expect(skyTrack(320, 72, { top: 66, bottom: 110 }, [help(94), guide, songs(211, 308), away])).toBeNull();
  // Without the Guide button the disc keeps to the sign row above the card.
  const track = skyTrack(320, 72, { top: 66, bottom: 110 }, [help(94), songs(211, 308), away])!;
  expect(track.y).toBe(88);
  clears(track, [help(94), songs(211, 308), away]);
});
