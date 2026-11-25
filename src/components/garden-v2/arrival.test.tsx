import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { SheetScope } from "@/components/ui/sheet-scope";
import { ARRIVAL_KEY, markGardenArrival } from "@/lib/garden-v2/arrival";
import type { GardenState } from "@/lib/garden-v2/model";
import { v2GardenFixture } from "@/test/garden-v2-fixture";

// The painted world, the flower studio and the flower layer need WebGPU and .wgsl; record what they are given.
const worlds: { callbacks: WorldRendererCallbacks; states: WorldSceneState[] }[] = [];
vi.mock("@/components/world/renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, state: WorldSceneState, callbacks: WorldRendererCallbacks) => {
    const record = { callbacks, states: [state] };
    worlds.push(record);
    return { update: (next: WorldSceneState) => record.states.push(next), travel: vi.fn(), pan: vi.fn(), dispose: vi.fn() };
  },
}));
vi.mock("@/components/world/flowers/studio-renderer", () => ({
  createStudioRenderer: () => ({ update: vi.fn(), dispose: vi.fn() }),
}));
vi.mock("@/components/world/flowers/flower-layer", () => ({
  createFlowerLayer: () => ({ draw: vi.fn(), setFlowers: vi.fn() }),
}));
// The night fireworks layer needs WebGPU; record what it is asked to play.
type Play = { seed: number; still: boolean; onStart?: () => void; onEnd?: () => void };
const fireworks = vi.hoisted(() => ({ plays: [] as Play[], readAwardsForDayV2: vi.fn() }));
vi.mock("@/components/world/fireworks/fireworks-layer", () => ({
  createFireworksLayer: () => ({ draw: vi.fn(), stop: vi.fn(), playing: false, play: (options: Play) => fireworks.plays.push(options) }),
}));
vi.mock("@/lib/garden-v2/achievement-actions", () => ({
  readAwardsForDayV2: fireworks.readAwardsForDayV2,
  readAchievementsV2: vi.fn(async () => ({ state: null, error: null })),
}));
const api = vi.hoisted(() => ({
  refreshGardenV2: vi.fn(),
  mutateGardenV2: vi.fn(),
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => api);
// The garden's overlays (#183) and the private moment read through their own actions.
vi.mock("@/lib/garden-v2/memory-actions", () => ({ loadMemoriesV2: vi.fn(async () => ({ items: [], more: false, error: null })) }));
const moment = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/private-interaction/actions", () => ({
  readPrivateInteraction: moment.read,
  answerPrivateInteraction: vi.fn(),
  controlPrivateInteraction: vi.fn(),
  previewPrivateInteraction: vi.fn(),
}));
vi.mock("@/lib/settings/actions", () => ({ readSettings: vi.fn(), saveSetting: vi.fn() }));
vi.mock("@/lib/memories/actions", () => ({ loadMemories: vi.fn() }));
vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn(), saveReply: vi.fn() }));
const peonyApi = vi.hoisted(() => ({ readPeonyV2: vi.fn(), mutatePeonyV2: vi.fn() }));
vi.mock("@/lib/garden-v2/peony-actions", () => peonyApi);
vi.mock("@/lib/auth/browser", () => ({ gardenBrowserClient: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { GardenV2 } = await import("./garden-v2");
const { ARRIVAL_FALLBACK_FADE_MS, ARRIVAL_SAFETY_MS, ARRIVAL_SETTLE_GAP_MS } = await import("./arrival");

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function garden(): GardenState {
  const state = v2GardenFixture();
  state.plants[0]!.entries = [];
  return state;
}

/** Renders the garden as a client navigation does (no server markup to hydrate). */
async function open(initialFlowerId: string | null = null) {
  const state = garden();
  api.refreshGardenV2.mockResolvedValue({ state, error: null });
  // As on the page: the sheet scope queues the private moment.
  const view = render(
    <SheetScope>
      <GardenV2 initial={{ state, error: null }} initialFlowerId={initialFlowerId} />
    </SheetScope>,
  );
  await flush();
  await flush();
  return { ...view, state };
}

const light = () => document.querySelector<HTMLElement>("[data-arrival-light]");
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, ARRIVAL_SETTLE_GAP_MS + 50)));
/** The GPU device is lost: the world recreates its renderer from the current scene state. */
const loseDevice = () => act(() => worlds.at(-1)!.callbacks.onLost({ reason: "unknown", message: "synthetic" } as GPUDeviceLostInfo));
const pendingMoment = () =>
  moment.read.mockResolvedValue({
    state: { status: "pending", content: { title: "A synthetic moment", message: "Placeholder.", choices: [{ key: "a", label: "One" }, { key: "b", label: "Two" }] } },
    error: null,
  });
const chromeHidden = () => /chromeHidden/.test(screen.getByRole("main").className);
const guide = () => document.querySelector("[data-garden-overlay='guide']");
const world = () => worlds[0]!;
const frame = (arrival: number | null) =>
  act(() => world().callbacks.onFrame?.({ viewProjection: new Float32Array(16), width: 100, height: 100, entryFade: 0, arrival }));

beforeEach(() => {
  worlds.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/garden");
  api.refreshGardenV2.mockReset();
  api.loadFlowerHistoryV2.mockReset().mockResolvedValue({ entries: [], error: null });
  fireworks.plays.length = 0;
  fireworks.readAwardsForDayV2.mockReset().mockResolvedValue({ state: null, error: "unavailable" });
  vi.stubGlobal("navigator", { ...navigator, gpu: {}, onLine: true });
  stubReducedMotion(false);
  moment.read.mockReset().mockResolvedValue({ state: { status: "unavailable" }, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("arriving from the house (#204)", () => {
  it("opens under the warm light, holds it until the world is ready, then reveals the garden before the guide", async () => {
    markGardenArrival();
    await open();
    // The very first paint is the warm light; the camera waits at the arrival's start.
    expect(light()).toHaveAttribute("data-arrival-light", "hold");
    expect(world().states[0]).toMatchObject({ arrival: "hold" });
    // The plot navigator (#206) is not there under the light, so nothing can start a bed framing.
    expect(screen.queryByRole("listbox", { name: "Plots in the garden" })).toBeNull();
    // Words, menus and other controls are hidden (and out of the keyboard order) under the light.
    expect(chromeHidden()).toBe(true);
    // The mark is used up: a refresh opens the garden normally.
    expect(window.sessionStorage.getItem(ARRIVAL_KEY)).toBeNull();
    expect(window.location.search).toBe("");

    act(() => world().callbacks.onReady());
    expect(world().states.at(-1)).toMatchObject({ arrival: "play" });
    // While layers warm up the light stays whole.
    frame(-1);
    expect(light()).toHaveAttribute("data-arrival-light", "light");
    expect(Number(light()!.style.opacity || "1")).toBe(1);
    frame(1.2);
    const thinning = Number(light()!.style.opacity);
    expect(thinning).toBeGreaterThan(0);
    expect(thinning).toBeLessThan(1);
    // Never thickens again (e.g. after a recreated GPU context restarts its clock).
    frame(-1);
    expect(Number(light()!.style.opacity)).toBe(thinning);
    frame(2.5);
    expect(light()).toHaveAttribute("data-arrival-light", "chrome");
    expect(chromeHidden()).toBe(false);
    // Still settling: no navigator, and the world frames no plot.
    expect(screen.queryByRole("listbox", { name: "Plots in the garden" })).toBeNull();
    expect(world().states.at(-1)?.selected ?? null).toBeNull();
    expect(guide()).toBeNull();
    expect(screen.queryByText(/scroll to wander closer/)).toBeNull();
    frame(4);
    expect(light()).toBeNull();
    // The first-visit guide greets only once the arrival has settled.
    await settle();
    expect(guide()).not.toBeNull();
    // Settled: the plot navigator appears (inert while the guide's sheet is open).
    const navigator = document.querySelector("[data-plot-navigator]");
    expect(navigator).not.toBeNull();
    expect(navigator).toHaveAttribute("inert");
    // Over: a world recreated later (after a device loss) never replays the arrival.
    expect(world().states.at(-1)?.arrival ?? null).toBeNull();
    loseDevice();
    await flush();
    expect(worlds).toHaveLength(2);
    expect(worlds[1]!.states[0]?.arrival ?? null).toBeNull();
  });

  it("holds a pending private moment until the garden has settled, then lets it open before the guide", async () => {
    pendingMoment();
    markGardenArrival();
    await open();
    await flush();
    expect(screen.queryByRole("dialog", { name: "A synthetic moment" })).toBeNull();
    act(() => world().callbacks.onReady());
    frame(1);
    frame(2.5);
    await flush();
    expect(screen.queryByRole("dialog", { name: "A synthetic moment" })).toBeNull();
    frame(4);
    await settle();
    expect(await screen.findByRole("dialog", { name: "A synthetic moment" })).toBeInTheDocument();
    // The moment opened first, so the guide does not greet over it this visit,
    // and the hint waits while it is open.
    expect(guide()).toBeNull();
    expect(screen.queryByText(/scroll to wander closer/)).toBeNull();
  });

  it("leaves direct visits unchanged", async () => {
    await open();
    expect(light()).toBeNull();
    expect(chromeHidden()).toBe(false);
    expect(world().states[0]?.arrival ?? null).toBeNull();
    act(() => world().callbacks.onReady());
    expect(guide()).not.toBeNull();
  });

  it("ignores the mark for a flower link, and an expired mark", async () => {
    markGardenArrival();
    const { unmount } = await open("00000000-0000-4000-8000-000000000001");
    expect(light()).toBeNull();
    unmount();
    worlds.length = 0;
    markGardenArrival(Date.now() - 60_000);
    await open();
    expect(light()).toBeNull();
    expect(world().states[0]?.arrival ?? null).toBeNull();
  });

  it("crossfades without a camera move under reduced motion", async () => {
    stubReducedMotion(true);
    markGardenArrival();
    await open();
    act(() => world().callbacks.onReady());
    expect(world().states.at(-1)).toMatchObject({ arrival: "play", reducedMotion: true });
    frame(0.3);
    expect(Number(light()!.style.opacity)).toBeCloseTo(0.5, 2);
    // The words come back with the crossfade.
    expect(light()).toHaveAttribute("data-arrival-light", "chrome");
    frame(0.8);
    expect(light()).toBeNull();
    expect(world().states.at(-1)?.arrival ?? null).toBeNull();
  });

  it("fades the light anyway when the world never gets ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    markGardenArrival();
    await open();
    act(() => vi.advanceTimersByTime(ARRIVAL_SAFETY_MS - 500));
    expect(light()).toHaveAttribute("data-arrival-light", "hold");
    act(() => vi.advanceTimersByTime(1000));
    expect(light()).toHaveAttribute("data-arrival-light", "fading");
    expect(light()!.style.opacity).toBe("0");
    // The camera does not stay at the arrival's start if the world turns up later.
    expect(world().states.at(-1)?.arrival ?? null).toBeNull();
    act(() => vi.advanceTimersByTime(ARRIVAL_FALLBACK_FADE_MS));
    expect(light()).toBeNull();
    // A world that turns up after the fallback starts at the overview, never at the arrival's start.
    loseDevice();
    await flush();
    expect(worlds).toHaveLength(2);
    expect(worlds[1]!.states[0]?.arrival ?? null).toBeNull();
  });

  it.each([
    ["while the light thins", 1],
    ["while the words fade in", 2.5],
  ])("gives up at once if the painting stops %s, releasing the light, the controls and a waiting moment", async (_when, seconds) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pendingMoment();
    markGardenArrival();
    await open();
    act(() => world().callbacks.onReady());
    frame(seconds);
    await flush();
    expect(screen.queryByRole("dialog", { name: "A synthetic moment" })).toBeNull();
    act(() => world().callbacks.onError(new Error("synthetic stop")));
    expect(light()).toHaveAttribute("data-arrival-light", "fading");
    expect(light()!.style.opacity).toBe("0");
    expect(chromeHidden()).toBe(false);
    act(() => vi.advanceTimersByTime(ARRIVAL_FALLBACK_FADE_MS + ARRIVAL_SETTLE_GAP_MS));
    await flush();
    expect(light()).toBeNull();
    // The stopped notice and the menus are back, and the waiting moment opens.
    expect(screen.getByText("The painted garden stopped.")).toBeInTheDocument();
    expect(document.querySelector('nav[aria-label="Garden keepsakes"]')).not.toBeNull();
    expect(await screen.findByRole("dialog", { name: "A synthetic moment" })).toBeInTheDocument();
  });

  it("settles anyway when the arrival's frames stop coming", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    pendingMoment();
    markGardenArrival();
    await open();
    act(() => world().callbacks.onReady());
    frame(1);
    frame(2.5);
    act(() => vi.advanceTimersByTime(ARRIVAL_SAFETY_MS - 1000));
    expect(light()).toHaveAttribute("data-arrival-light", "chrome");
    act(() => vi.advanceTimersByTime(1500));
    expect(light()).toHaveAttribute("data-arrival-light", "fading");
    act(() => vi.advanceTimersByTime(ARRIVAL_FALLBACK_FADE_MS + ARRIVAL_SETTLE_GAP_MS));
    await flush();
    expect(light()).toBeNull();
    expect(await screen.findByRole("dialog", { name: "A synthetic moment" })).toBeInTheDocument();
  });

  it("fades the light at once without WebGPU, showing the notice", async () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: undefined, onLine: true });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    markGardenArrival();
    await open();
    expect(light()).toHaveAttribute("data-arrival-light", "fading");
    expect(screen.getByText("This garden is painted with WebGPU.")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ARRIVAL_FALLBACK_FADE_MS));
    expect(light()).toBeNull();
  });
});
