import { act, render, renderHook } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { readSettings } = vi.hoisted(() => ({ readSettings: vi.fn() }));
vi.mock("@/lib/settings/actions", () => ({ readSettings, saveSetting: vi.fn() }));
import { MemberPreferences } from "@/components/settings/member-preferences";
import { alongTrack, celestialBody, GardenAmbience, gardenPhase, skyTrack, useGardenLight, type GardenPhase } from "./garden-ambience";

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

function Ambience({ now, gentle }: { now: number; gentle: boolean }) {
  const light = useGardenLight(now);
  return (
    <MemberPreferences initial={{ state: { revision: 1, guide: "finished", gentle_motion: gentle }, error: null }}>
      <GardenAmbience light={light} />
    </MemberPreferences>
  );
}
const layer = () => document.querySelector<HTMLElement>("[data-phase]");

// On 2026-09-18 Los Angeles has civil dawn 6:13, sunrise 6:38, solar noon 12:47,
// sunset 6:55 p.m. and civil dusk 7:20 p.m. PDT.
it("derives the phase from the real Pacific sun, never from the Moonflower flag", () => {
  const phase = (time: string) => gardenPhase(at(time)).phase;
  expect(phase("00:20")).toBe("night");
  expect(phase("04:00")).toBe("night");
  expect(phase("06:10")).toBe("night");
  expect(phase("06:20")).toBe("dawn");
  expect(phase("07:35")).toBe("dawn");
  expect(phase("07:45")).toBe("day");
  expect(phase("12:30")).toBe("day");
  expect(phase("17:50")).toBe("day");
  expect(phase("18:00")).toBe("golden");
  expect(phase("18:50")).toBe("golden");
  expect(phase("19:00")).toBe("dusk");
  expect(phase("19:15")).toBe("dusk");
  expect(phase("19:25")).toBe("night");
  expect(phase("22:00")).toBe("night");
});

it("follows the seasons: the same clock time is day in June and night in December", () => {
  // 5:30 p.m.: golden hour in June (sunset 8:08 p.m. PDT) is past civil dusk in December.
  expect(gardenPhase(Date.parse("2026-06-21T17:30:00-07:00")).phase).toBe("day");
  expect(gardenPhase(Date.parse("2026-06-21T19:30:00-07:00")).phase).toBe("golden");
  expect(gardenPhase(Date.parse("2025-12-21T17:30:00-08:00")).phase).toBe("night");
  expect(gardenPhase(Date.parse("2025-12-21T16:15:00-08:00")).phase).toBe("golden");
  expect(gardenPhase(Date.parse("2025-12-21T07:30:00-08:00")).phase).toBe("dawn");
  expect(gardenPhase(Date.parse("2026-06-21T05:30:00-07:00")).phase).toBe("dawn");
});

// A 24-hour sweep, a minute at a time, on a summer and a winter date.
function sweep(start: number) {
  return Array.from({ length: 1440 }, (_, minute) => start + minute * 60_000);
}

it("shows the sun from dawn through dusk and the moon only at night, in the sky and on the clock", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  for (const start of [Date.parse("2026-06-21T00:00:00-07:00"), Date.parse("2025-12-21T00:00:00-08:00")]) {
    const seen = new Set<GardenPhase>();
    let last: GardenPhase | null = null;
    const order: GardenPhase[] = [];
    for (const now of sweep(start)) {
      const light = gardenPhase(now);
      seen.add(light.phase);
      if (light.phase !== last) order.push(light.phase);
      last = light.phase;
      expect(light.progress).toBeGreaterThanOrEqual(0);
      expect(light.progress).toBeLessThanOrEqual(1);
    }
    expect(order).toEqual(["night", "dawn", "day", "golden", "dusk", "night"]);
    expect(seen.size).toBe(5);
  }
  // The rendered sky's disc matches the clock icon's choice for each phase.
  const view = render(<Ambience now={at("12:30")} gentle />);
  for (const time of ["00:20", "06:20", "12:30", "18:30", "19:10", "23:00"]) {
    view.rerender(<Ambience now={at(time)} gentle />);
    const phase = layer()!.dataset.phase as GardenPhase;
    expect(phase).toBe(gardenPhase(at(time)).phase);
    const disc = document.querySelector<HTMLElement>("[data-celestial]");
    // jsdom measures no sky track, so the disc may be left out; when drawn it agrees.
    if (disc) expect(disc.dataset.celestial).toBe(celestialBody(phase));
  }
  expect(celestialBody("night")).toBe("moon");
  for (const phase of ["dawn", "day", "golden", "dusk"] as const) expect(celestialBody(phase)).toBe("sun");
});

it("keeps one light object per clock minute", () => {
  const { result, rerender } = renderHook(({ now }) => useGardenLight(now), { initialProps: { now: at("12:30") } });
  const first = result.current;
  expect(first?.phase).toBe("day");
  rerender({ now: at("12:30") + 20_000 });
  rerender({ now: at("12:30") + 59_000 });
  expect(result.current).toBe(first);
  rerender({ now: at("12:31") });
  expect(result.current).not.toBe(first);
});

it("server-renders a neutral garden and hydrates into the phase without warnings", async () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const tree = <Ambience now={at("23:30")} gentle />;
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
  render(<Ambience now={at("23:30")} gentle />);
  const ambience = layer()!;
  expect(ambience).toHaveAttribute("aria-hidden", "true");
  expect(ambience.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
});

it("moves fireflies at night and petals by day while motion is allowed", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("23:30")} gentle />);
  expect(layer()).toHaveAttribute("data-motion", "live");
  expect(document.querySelectorAll("[data-firefly]").length).toBeGreaterThan(0);
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
  view.rerender(<Ambience now={at("12:30")} gentle />);
  expect(layer()).toHaveAttribute("data-phase", "day");
  expect(document.querySelectorAll("[data-firefly]")).toHaveLength(0);
  expect(document.querySelectorAll("[data-petal]").length).toBeGreaterThan(0);
});

it("stops all ambience motion when the member turns gentle motion off", () => {
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("23:30")} gentle={false} />);
  expect(layer()).toHaveAttribute("data-motion", "still");
  // Fireflies remain as static glows; drifting petals are removed.
  expect(document.querySelectorAll("[data-firefly]").length).toBeGreaterThan(0);
  view.rerender(<Ambience now={at("12:30")} gentle={false} />);
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
});

it("stops all ambience motion under the device reduced-motion setting", () => {
  reduce = true;
  readSettings.mockReturnValue(new Promise(() => {}));
  const view = render(<Ambience now={at("12:30")} gentle />);
  expect(layer()).toHaveAttribute("data-motion", "still");
  expect(document.querySelectorAll("[data-petal]")).toHaveLength(0);
  view.rerender(<Ambience now={at("23:30")} gentle />);
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

it("moves the sun with its real azimuth and the moon from civil dusk to civil dawn", () => {
  const progress = (time: string) => gardenPhase(at(time)).progress;
  // Before sunrise the sun waits at the rising edge, and after sunset at the setting edge.
  expect(progress("06:20")).toBe(0);
  expect(progress("19:10")).toBe(1);
  // At solar noon the sun is due south, halfway across.
  expect(progress("12:47")).toBeCloseTo(0.5, 1);
  expect(progress("09:00")).toBeLessThan(progress("12:00"));
  expect(progress("15:00")).toBeGreaterThan(progress("12:47"));
  // The moon starts at civil dusk and ends at the next civil dawn.
  expect(progress("19:25")).toBeLessThan(0.02);
  expect(progress("00:47")).toBeCloseTo(0.5, 1);
  expect(progress("06:10")).toBeGreaterThan(0.98);
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
