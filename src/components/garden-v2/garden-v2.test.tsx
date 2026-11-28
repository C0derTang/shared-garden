import { act, render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioState } from "@/components/world/flowers/studio-renderer";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { awayKey, takeAwaySnapshot } from "@/lib/garden-v2/away";
import { flowerTypes, type GardenState } from "@/lib/garden-v2/model";
import { compactAreaLayout as typeAreaLayout } from "@/lib/garden-v2/compact-areas";
import type { GardenView } from "@/lib/garden-v2/views";
import { guideKey } from "@/lib/garden-v2/views";
import { v2EntryFixture, v2GardenFixture } from "@/test/garden-v2-fixture";

// The painted world, the flower studio and the flower layer need WebGPU and .wgsl; record what they are given.
const worlds: { callbacks: WorldRendererCallbacks; states: WorldSceneState[] }[] = [];
vi.mock("@/components/world/renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, state: WorldSceneState, callbacks: WorldRendererCallbacks) => {
    const record = { callbacks, states: [state] };
    worlds.push(record);
    return { update: (next: WorldSceneState) => record.states.push(next), travel: vi.fn(), pan: vi.fn(), dispose: vi.fn() };
  },
}));
const studios = vi.hoisted(() => ({ states: [] as StudioState[] }));
vi.mock("@/components/world/flowers/studio-renderer", () => ({
  createStudioRenderer: (_canvas: HTMLCanvasElement, state: StudioState) => {
    studios.states.push(state);
    return { update: (next: StudioState) => studios.states.push(next), dispose: vi.fn() };
  },
}));
// The flower layer needs WebGPU; record the Dandelion seed blows it is asked for (#201).
type SeedRequest = { id: string; onStart?: () => void };
const seeds = vi.hoisted(() => ({ requests: [] as SeedRequest[], deferred: [] as (string | null)[], holds: [] as boolean[] }));
vi.mock("@/components/world/flowers/flower-layer", () => ({
  createFlowerLayer: () => ({
    draw: vi.fn(),
    setFlowers: vi.fn(),
    blowSeeds: (id: string, options?: { onStart?: () => void }) => seeds.requests.push({ id, onStart: options?.onStart }),
    deferSeeds: (id: string | null) => seeds.deferred.push(id),
    holdSeeds: (hold: boolean) => seeds.holds.push(hold),
    waitingSeeds: 0,
  }),
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
vi.mock("@/lib/private-interaction/actions", () => ({
  readPrivateInteraction: vi.fn(async () => ({ state: { status: "unavailable" }, error: null })),
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

const { GardenV2, HEART_LIFT, careHearts } = await import("./garden-v2");

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function stubReducedMotion() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function garden(): GardenState {
  const state = v2GardenFixture();
  const rose = state.plants[0]!;
  rose.flower.growth_units = 2;
  rose.member1_submitted = false;
  rose.member2_submitted = true;
  rose.entries = [];
  return state;
}

beforeEach(() => {
  worlds.length = 0;
  studios.states.length = 0;
  seeds.requests.length = 0;
  seeds.deferred.length = 0;
  seeds.holds.length = 0;
  window.localStorage.clear();
  // These tests start after the first-visit guide (#183 has its own tests).
  window.localStorage.setItem(guideKey(1), "1");
  window.history.replaceState(null, "", "/garden");
  api.refreshGardenV2.mockReset();
  api.mutateGardenV2.mockReset();
  api.loadFlowerHistoryV2.mockReset().mockResolvedValue({ entries: [], error: null });
  api.readRepliesV2.mockReset().mockResolvedValue({ replies: [], error: null });
  fireworks.plays.length = 0;
  fireworks.readAwardsForDayV2.mockReset().mockResolvedValue({ state: null, error: "unavailable" });
  vi.stubGlobal("navigator", { ...navigator, gpu: {}, onLine: true });
  stubReducedMotion();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount(state = garden(), initialFlowerId: string | null = null, initialView: GardenView | null = null) {
  api.refreshGardenV2.mockResolvedValue({ state, error: null });
  const view = render(<GardenV2 initial={{ state, error: null }} initialFlowerId={initialFlowerId} initialView={initialView} />);
  await flush();
  await flush();
  act(() => worlds[0]!.callbacks.onReady());
  return { ...view, state };
}

const captionIds = () => [...document.querySelectorAll("[data-caption]")].map((element) => element.getAttribute("data-caption"));
const hearts = () => [...document.querySelectorAll<HTMLElement>('[data-caption^="care-"]')];

describe("GardenV2", () => {
  it("opens a real writable form from the invitation before a world frame, without submitting", async () => {
    const state = garden();
    api.refreshGardenV2.mockResolvedValue({ state, error: null });
    render(<GardenV2 initial={{ state, error: null }} />);
    await flush();
    const invitation = screen.getByRole("button", { name: /write a note.*rose/i });
    fireEvent.click(invitation);
    const field = within(screen.getByRole("dialog", { name: "rose" })).getByRole("textbox");
    fireEvent.change(field, { target: { value: "A synthetic draft" } });
    expect(field).toHaveValue("A synthetic draft");
    expect(api.mutateGardenV2).not.toHaveBeenCalled();
    expect(location.search).toBe(`?flower=${state.plants[0]!.flower.id}`);
  });

  it("replaces a cared invitation with the newly due UUID, and safely focuses the world when none remains", async () => {
    const user = userEvent.setup();
    const state = garden();
    await mount(state);
    await user.click(screen.getByRole("button", { name: /write a note.*rose/i }));
    const done = structuredClone(state);
    done.server_now = "2026-11-02T17:01:00Z";
    done.plants[0]!.member1_submitted = true;
    api.refreshGardenV2.mockResolvedValue({ state: done, error: null });
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /write a note.*rose/i })).toBeNull();
    expect(document.activeElement).toBe(document.querySelector("[data-garden-world]"));
    const next = structuredClone(done);
    next.server_now = "2026-11-02T17:02:00Z";
    next.plants.push({ ...structuredClone(state.plants[0]!), flower: { ...state.plants[0]!.flower, id: "00000000-0000-4000-8000-000000000099", spot: 12001 } });
    api.refreshGardenV2.mockResolvedValue({ state: next, error: null });
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    await user.click(screen.getByRole("button", { name: /write a note.*rose/i }));
    expect(location.search).toBe("?flower=00000000-0000-4000-8000-000000000099");
  });

  it("withholds stale invitations after a refresh error", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /write a note.*rose/i })).toBeInTheDocument();
    api.refreshGardenV2.mockResolvedValue({ state: null, error: "Synthetic refresh failed" });
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(screen.queryByRole("button", { name: /write a note.*rose/i })).toBeNull();
    expect(screen.getByText("Synthetic refresh failed")).toHaveAttribute("role", "status");
  });

  it("keeps the invitation unavailable while a submitted form is still saving after close", async () => {
    const user = userEvent.setup();
    await mount();
    let finish!: (result: { state: null; error: string; saved: false }) => void;
    api.mutateGardenV2.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await user.click(screen.getByRole("button", { name: /write a note.*rose/i }));
    await user.type(screen.getByRole("textbox"), "A synthetic pending draft");
    await user.click(screen.getByRole("button", { name: "share" }));
    await user.keyboard("{Escape}");
    const invitation = screen.getByRole("button", { name: /write a note.*rose/i });
    expect(invitation).toBeDisabled();
    await user.click(invitation);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.mutateGardenV2).toHaveBeenCalledTimes(1);
    await act(async () => finish({ state: null, error: "Synthetic save failed", saved: false }));
  });

  it("retries a refused invitation focus after modal close", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: /write a note.*rose/i }));
    // Closing autofocus can run while the page is still inert beneath Radix.
    const native = HTMLElement.prototype.focus;
    let released = false;
    const focus = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function(this: HTMLElement, options) { if (released) native.call(this, options); });
    try {
      await user.keyboard("{Escape}");
      released = true;
      await act(async () => { await new Promise(resolve => requestAnimationFrame(resolve)); });
      expect(document.activeElement).not.toBe(document.body);
    } finally { focus.mockRestore(); }
  });

  it("opens ordinary physical care immediately and a newer visit wins over a held-frame return", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const state = garden();
    state.plants.push({ ...structuredClone(state.plants[0]!), flower: { ...state.plants[0]!.flower, id: "00000000-0000-4000-8000-000000000002", spot: 2, type_key: "tulip" } });
    await mount(state);
    vi.useFakeTimers();
    try {
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: state.plants[0]!.flower.id, distance: 1 }));
      const field = within(screen.getByRole("dialog", { name: "rose" })).getByRole("textbox");
      fireEvent.change(field, { target: { value: "No timer advanced" } });
      expect(field).toHaveValue("No timer advanced");
      fireEvent.click(screen.getByRole("button", { name: "Back to the garden" }));
      // No renderer frame confirms the return before a newer deliberate visit.
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: state.plants[1]!.flower.id, distance: 1 }));
      expect(screen.getByRole("dialog", { name: "tulip" })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(1000));
      expect(screen.getByRole("dialog", { name: "tulip" })).toBeInTheDocument();
      expect(api.mutateGardenV2).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("paints thirteen named areas and lists their flowers and planting targets accessibly", async () => {
    const { state } = await mount();
    const scene = worlds[0]!.states.at(-1)!;
    expect(scene).toMatchObject({ spotCapacity: 12, occupiedSpots: [1], paused: false, focus: null });
    expect(scene).not.toHaveProperty("selected");
    expect(scene.flowers.map((f) => f.id)).toEqual([state.plants[0]!.flower.id]);
    // Only the world's title and a "♡" over the flower waiting on your care float in the scene;
    // no names over the plants or seed marks (#206, #214).
    expect(captionIds().filter(id=>!id?.startsWith("route-"))).toEqual(["title", ...flowerTypes.map((type) => `area-${type}`), `care-${state.plants[0]!.flower.id}`]);
    expect(scene.plantingLayout?.spots).toEqual(typeAreaLayout(state).spots);
    expect(scene.flowers[0]!.position).toEqual(scene.plantingLayout!.spots.find((spot) => spot.spot === 1)!.position);
    expect(screen.queryByRole("link", { name: /^rose/i })).toBeNull();
    // No plot navigator (#210): no listbox, chevrons or visit/plant controls.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /previous plot|next plot|^visit$|^plant$/i })).toBeNull();
    // Every plot is in the hidden list, in reading order, with its full name.
    const list = screen.getByRole("navigation", { name: "Plots in the garden" });
    const plots = within(list).getAllByRole("button");
    expect(plots).toHaveLength(14);
    expect(within(list).getByRole("button", { name: /^rose, in bud, 2 of 5\. Your care is open; partner cared today\. rose area$/ })).toHaveTextContent("rose · 2 of 5 ♡ · rose area");
    expect(within(list).getAllByRole("button", { name: /^Plant a / })).toHaveLength(13);
    expect(within(list).getByRole("button", { name: "Plant a cactus in the cactus area" })).toHaveTextContent("plant cactus · cactus area");
    expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByText(/dev showcase/i)).toBeNull();
  });

  it("reaches the hidden plot list by keyboard, opens a flower with Enter and returns focus to it on Escape", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    const list = screen.getByRole("navigation", { name: "Plots in the garden" });
    const rose = within(list).getByRole("button", { name: /^rose,/ });
    // Tabbing from the world reaches the plots after the page's other controls.
    screen.getByRole("link", { name: "home" }).focus();
    for (let i = 0; i < 20 && !list.contains(document.activeElement); i += 1) await user.tab();
    expect(list.contains(document.activeElement)).toBe(true);
    rose.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "rose" });
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true, focus: { position: expect.any(Array) } });
    expect(window.location.search).toBe(`?flower=${state.plants[0]!.flower.id}`);
    expect(within(dialog).getByRole("img", { name: /The rose, in bud/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "rose" }));
    // Under the split view the list is inert and hidden from assistive technology.
    const nav = document.querySelector("[data-plot-list]")!;
    expect(nav).toHaveAttribute("inert");
    expect(nav).toHaveAttribute("aria-hidden", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(nav).not.toHaveAttribute("inert");
    expect(nav).not.toHaveAttribute("aria-hidden");
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false, focus: null });
    expect(window.location.search).toBe("");
    expect(document.activeElement).toBe(rose);
  });

  it("returns focus to the hidden plot with motion on, after immediate opening and close", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const user = userEvent.setup();
    await mount();
    const rose = within(screen.getByRole("navigation", { name: "Plots in the garden" })).getByRole("button", { name: /^rose,/ });
    rose.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "rose" });
    await user.click(within(dialog).getByRole("button", { name: /back to the garden/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
    expect(document.activeElement).toBe(rose);
  });

  it("is inert and hidden while the first-visit guide is open", async () => {
    window.localStorage.removeItem(guideKey(1));
    const state = garden();
    api.refreshGardenV2.mockResolvedValue({ state, error: null });
    render(<GardenV2 initial={{ state, error: null }} />);
    await flush();
    await flush();
    act(() => worlds[0]!.callbacks.onReady());
    expect(await screen.findByRole("dialog", { name: /guide/i })).toBeInTheDocument();
    const nav = document.querySelector("[data-plot-list]");
    expect(nav).toHaveAttribute("inert");
    expect(nav).toHaveAttribute("aria-hidden", "true");
  });

  it("shows a Sunflower's care like any daily flower, and keeps the Peony quiet", async () => {
    const state = garden();
    const rose = state.plants[0]!;
    state.plants.push(
      { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000bb", spot: 2, type_key: "sunflower" }, member2_submitted: false },
      { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000cc", spot: 3, type_key: "peony" }, member2_submitted: false },
    );
    state.garden.next_spot = 4;
    await mount(state);
    const list = screen.getByRole("navigation", { name: "Plots in the garden" });
    const sunflower = within(list).getByRole("button", { name: /^sunflower,/ });
    expect(sunflower.getAttribute("aria-label")).toMatch(/Your care is open/);
    const peony = within(list).getByRole("button", { name: /^peony,/ });
    expect(peony.getAttribute("aria-label")).not.toMatch(/care|cared/i);
  });

  it("plants on an empty plot from the hidden list, and returns focus to that plot", async () => {
    const user = userEvent.setup();
    await mount();
    const empty = within(screen.getByRole("navigation", { name: "Plots in the garden" })).getByRole("button", { name: "Plant a cactus in the cactus area" });
    empty.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "plant a seed" });
    expect(within(dialog).getByRole("radio", { name: /^cactus/ })).toBeChecked();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(document.activeElement).toBe(empty);
  });

  it("keeps direct taps in the world working, and returns focus to the world after them", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: state.plants[0]!.flower.id, distance: 1 }));
    expect(await screen.findByRole("dialog", { name: "rose" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
    expect(document.activeElement).toBe(document.querySelector("[data-garden-world]"));
  });

  it("opens a deep-linked flower straight away", async () => {
    const state = garden();
    await mount(state, state.plants[0]!.flower.id);
    expect(await screen.findByRole("dialog", { name: "rose" })).toBeInTheDocument();
  });

  it("plants any flower on an empty spot, asking a Dandelion for its wish", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    // Tapping the glowing seed mark of spot 2 in the world.
    act(() => worlds[0]!.callbacks.onPick({ kind: "spot", spot: -1, distance: 1 }));
    const dialog = await screen.findByRole("dialog", { name: "plant a seed" });
    expect(within(dialog).getAllByRole("radio")).toHaveLength(13);
    await user.click(within(dialog).getByRole("radio", { name: /^dandelion/ }));
    const plant = within(dialog).getByRole("button", { name: "plant the dandelion" });
    expect(plant).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Your shared wish" }), "  A synthetic wish ");
    const planted = structuredClone(state);
    planted.plants.push({ ...structuredClone(state.plants[0]!), flower: { ...state.plants[0]!.flower, id: "00000000-0000-4000-8000-000000000002", spot: 2, type_key: "dandelion", shared_wish: "A synthetic wish" } });
    api.mutateGardenV2.mockResolvedValue({ state: planted, saved: true, error: null });
    await user.click(plant);
    expect(api.mutateGardenV2).toHaveBeenCalledWith({ kind: "plant", type: "dandelion", spot: 2, wish: "A synthetic wish" });
    // It then opens the new flower so today's care is one tap away.
    expect(await screen.findByRole("dialog", { name: "dandelion" })).toBeInTheDocument();
    expect(screen.getByText("The dandelion is planted.")).toBeInTheDocument();
  });

  it.each(["close only", "newer flower"] as const)("applies a delayed planted state without taking over after %s", async (next) => {
    const user = userEvent.setup();
    const { state } = await mount();
    let finish!: (result: { state: GardenState; saved: true; error: null }) => void;
    api.mutateGardenV2.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="-1"]')!);
    const planting = screen.getByRole("dialog", { name: "plant a seed" });
    await user.click(within(planting).getByRole("radio", { name: /^tulip/ }));
    await user.click(within(planting).getByRole("button", { name: "plant the tulip" }));
    expect(api.mutateGardenV2).toHaveBeenCalledWith({ kind: "plant", type: "tulip", spot: 2 });
    await user.keyboard("{Escape}");
    if (next === "newer flower") {
      await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="1"]')!);
      await user.type(screen.getByRole("textbox"), "Newer intentional rose draft");
    }
    const before = worlds[0]!.states.at(-1)!;
    const planted = structuredClone(state);
    planted.plants.push({ ...structuredClone(state.plants[0]!), entries: [], member1_submitted: false, member2_submitted: false, flower: { ...state.plants[0]!.flower, id: "00000000-0000-4000-8000-000000000002", spot: 2, type_key: "tulip", planted_at: state.server_now } });
    planted.garden.next_spot = 3;
    api.refreshGardenV2.mockResolvedValue({ state: planted, error: null });
    await act(async () => finish({ state: planted, saved: true, error: null }));
    await flush();
    // The real save is retained; only the stale view continuation is canceled.
    expect(worlds[0]!.states.at(-1)!.flowers.map(flower => flower.id)).toContain("00000000-0000-4000-8000-000000000002");
    expect(api.mutateGardenV2).toHaveBeenCalledTimes(1);
    expect(worlds[0]!.states.at(-1)!.tourDistance).toBe(before.tourDistance);
    expect(worlds[0]!.states.at(-1)!.focus).toEqual(before.focus);
    if (next === "close only") {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(window.location.search).toBe("");
    } else {
      expect(screen.getByRole("dialog", { name: "rose" })).toBeInTheDocument();
      expect(screen.getByRole("textbox")).toHaveValue("Newer intentional rose draft");
      expect(screen.getByRole("textbox")).toHaveFocus();
      expect(window.location.search).toBe(`?flower=${state.plants[0]!.flower.id}`);
    }
  });

  it("discards a queued planted-flower visit when a newer activity opens before its state refresh", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    let deliver!: (result: { state: GardenState; error: null }) => void;
    api.refreshGardenV2.mockImplementation(() => new Promise(resolve => { deliver = resolve; }));
    // The write succeeded, but its follow-up read is still in flight.
    api.mutateGardenV2.mockResolvedValue({ state: null, saved: true, error: null });
    await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="-1"]')!);
    const planting = screen.getByRole("dialog", { name: "plant a seed" });
    await user.click(within(planting).getByRole("radio", { name: /^tulip/ }));
    await user.click(within(planting).getByRole("button", { name: "plant the tulip" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="1"]')!);
    await user.type(screen.getByRole("textbox"), "A draft newer than the queued visit");
    const planted = structuredClone(state);
    planted.plants.push({ ...structuredClone(state.plants[0]!), entries: [], flower: { ...state.plants[0]!.flower, id: "00000000-0000-4000-8000-000000000002", spot: 2, type_key: "tulip" } });
    planted.garden.next_spot = 3;
    await act(async () => deliver({ state: planted, error: null }));
    await flush();
    expect(worlds[0]!.states.at(-1)!.flowers.map(flower => flower.id)).toContain("00000000-0000-4000-8000-000000000002");
    expect(screen.getByRole("dialog", { name: "rose" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("A draft newer than the queued visit");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(window.location.search).toBe(`?flower=${state.plants[0]!.flower.id}`);
    expect(api.mutateGardenV2).toHaveBeenCalledTimes(1);
  });

  it("opens sparse grouped flowers by their original identity and reads their existing history", async () => {
    const user = userEvent.setup();
    const state = garden();
    const rose = state.plants[0]!;
    rose.flower.spot = 24;
    rose.flower.growth_units = 3;
    state.garden.spot_capacity = 24;
    state.garden.next_spot = 1;
    state.plants.push({ ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-000000000002", type_key: "cactus", spot: 12 } });
    const entry = { ...v2EntryFixture(), garden_day: "2026-11-01", payload: { text: "An earlier synthetic memory." } };
    api.loadFlowerHistoryV2.mockResolvedValue({ entries: [entry], error: null });
    await mount(state);
    await user.click(within(screen.getByRole("navigation", { name: "Plots in the garden" })).getByRole("button", { name: /^rose,/ }));
    const dialog = await screen.findByRole("dialog", { name: "rose" });
    await user.click(within(dialog).getByRole("button", { name: "read earlier days" }));
    expect(await within(dialog).findByText("An earlier synthetic memory.")).toBeInTheDocument();
    expect(api.loadFlowerHistoryV2).toHaveBeenCalledWith(rose.flower.id, null);
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "3");
  });

  it("tells you what happened while you were away", async () => {
    const before = garden();
    before.plants[0]!.member2_submitted = false;
    window.localStorage.setItem(awayKey(1), JSON.stringify(takeAwaySnapshot(before)));
    const state = garden();
    state.plants[0]!.flower.growth_units = 3;
    await mount(state);
    const note = screen.getByRole("region", { name: "while you were away…" });
    expect(note).toHaveTextContent("partner cared for the rose");
    expect(note).toHaveTextContent("the rose grew");
    await userEvent.setup().click(within(note).getByRole("button", { name: "lovely, thanks" }));
    expect(screen.queryByRole("region", { name: "while you were away…" })).toBeNull();
  });

  describe("night fireworks", () => {
    /** 9 p.m. PST on the fixture's garden day (after sunset), with an achievement earned that day. */
    function night(earned = true) {
      const state = garden();
      state.server_now = "2026-11-03T05:00:00Z";
      fireworks.readAwardsForDayV2.mockResolvedValue({
        state: {
          server_now: state.server_now,
          garden_day: "2026-11-02",
          day: "2026-11-02",
          earned,
          awards: earned ? [{ achievement_id: "first-seed", title: "First seed planted", earned_at: "2026-11-02T18:00:00Z", earned_day: "2026-11-02" }] : [],
        },
        error: null,
      });
      return state;
    }

    it("plays once by itself after an achievement, then only from the replay", async () => {
      const user = userEvent.setup();
      const first = await mount(night());
      await flush();
      expect(fireworks.readAwardsForDayV2).toHaveBeenCalledWith("2026-11-02");
      expect(fireworks.plays).toHaveLength(1);
      // Reduced motion (stubbed on) gets the still sky.
      expect(fireworks.plays[0]).toMatchObject({ still: true });
      expect(worlds[0]!.states.at(-1)!.layers).toHaveLength(2);
      expect(screen.getByText(/for today’s achievement: First seed planted/)).toBeInTheDocument();
      // While the show plays the replay is quiet and inert; the big title steps aside.
      expect(screen.getByRole("button", { name: "replay fireworks" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("main")).toHaveAttribute("data-fireworks");
      act(() => fireworks.plays[0]!.onStart?.());
      expect(JSON.parse(window.localStorage.getItem("garden-v2:fireworks:1")!)).toEqual({ day: "2026-11-02" });
      act(() => fireworks.plays[0]!.onEnd?.());
      expect(screen.queryByText(/for today’s achievement/)).toBeNull();
      expect(screen.getByRole("main")).not.toHaveAttribute("data-fireworks");
      expect(screen.getByRole("button", { name: "replay fireworks" })).not.toHaveAttribute("aria-disabled");
      await user.click(screen.getByRole("button", { name: "replay fireworks" }));
      expect(fireworks.plays).toHaveLength(2);
      expect(screen.getByText(/for today’s achievement: First seed planted/)).toBeInTheDocument();
      first.unmount();

      // Opening the garden again the same night: no show by itself, the replay is offered.
      worlds.length = 0;
      await mount(night());
      await flush();
      expect(fireworks.plays).toHaveLength(2);
      expect(screen.getByRole("button", { name: "replay fireworks" })).toBeInTheDocument();
    });

    it("keeps keyboard focus on the replay through the show", async () => {
      const user = userEvent.setup();
      await mount(night());
      await flush();
      act(() => fireworks.plays[0]!.onEnd?.());
      const replay = screen.getByRole("button", { name: "replay fireworks" });
      replay.focus();
      await user.keyboard("{Enter}");
      expect(fireworks.plays).toHaveLength(2);
      expect(document.activeElement).toBe(replay);
      expect(replay).toHaveAttribute("aria-disabled", "true");
      // Pressing it again mid-show does nothing.
      await user.keyboard("{Enter}");
      expect(fireworks.plays).toHaveLength(2);
      act(() => fireworks.plays[1]!.onEnd?.());
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "replay fireworks" }));
      expect(document.activeElement).not.toHaveAttribute("aria-disabled");
    });

    it("lets the away note wait until the show ends", async () => {
      const before = garden();
      before.plants[0]!.member2_submitted = false;
      window.localStorage.setItem(awayKey(1), JSON.stringify(takeAwaySnapshot(before)));
      await mount(night());
      await flush();
      expect(fireworks.plays).toHaveLength(1);
      expect(screen.queryByRole("region", { name: "while you were away…" })).toBeNull();
      act(() => fireworks.plays[0]!.onEnd?.());
      expect(screen.getByRole("region", { name: "while you were away…" })).toBeInTheDocument();
    });

    it("does not read awards while the tab is hidden", async () => {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      try {
        await mount(night());
        await flush();
        expect(fireworks.readAwardsForDayV2).not.toHaveBeenCalled();
        visibility.mockReturnValue("visible");
        await act(async () => {
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await flush();
        expect(fireworks.readAwardsForDayV2).toHaveBeenCalledWith("2026-11-02");
      } finally {
        visibility.mockRestore();
      }
    });

    it("waits behind an overlay, and pauses with its words hidden while one is open", async () => {
      const user = userEvent.setup();
      // Arriving at ?view=memories: the show does not start behind the sheet.
      const first = await mount(night(), null, "memories");
      await flush();
      expect(await screen.findByRole("dialog", { name: /memories/i })).toBeInTheDocument();
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true });
      expect(fireworks.plays).toHaveLength(0);
      expect(screen.queryByText(/for today’s achievement/)).toBeNull();
      await user.keyboard("{Escape}");
      await flush();
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(fireworks.plays).toHaveLength(1);
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false });
      expect(screen.getByText(/for today’s achievement: First seed planted/)).toBeInTheDocument();
      first.unmount();

      // Mid-show: opening Memories pauses the world and hides the caption and replay; closing resumes.
      worlds.length = 0;
      fireworks.plays.length = 0;
      window.localStorage.removeItem("garden-v2:fireworks:1");
      window.history.replaceState(null, "", "/garden");
      await mount(night());
      await flush();
      expect(fireworks.plays).toHaveLength(1);
      await user.click(screen.getByRole("link", { name: "memories" }));
      await screen.findByRole("dialog", { name: /memories/i });
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true });
      expect(screen.queryByText(/for today’s achievement/)).toBeNull();
      expect(screen.queryByRole("button", { name: "replay fireworks" })).toBeNull();
      await user.keyboard("{Escape}");
      await flush();
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false });
      expect(screen.getByText(/for today’s achievement: First seed planted/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "replay fireworks" })).toHaveAttribute("aria-disabled", "true");
      // Nothing restarted: it was the same show all along.
      expect(fireworks.plays).toHaveLength(1);
    });

    it("plays nothing by day, or at night without an achievement", async () => {
      const day = await mount();
      await flush();
      expect(fireworks.readAwardsForDayV2).not.toHaveBeenCalled();
      day.unmount();
      worlds.length = 0;
      await mount(night(false));
      await flush();
      expect(fireworks.readAwardsForDayV2).toHaveBeenCalled();
      expect(fireworks.plays).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "replay fireworks" })).toBeNull();
    });

    it("keeps its words out of the split view, where the world pauses", async () => {
      const user = userEvent.setup();
      await mount(night());
      await flush();
      expect(fireworks.plays).toHaveLength(1);
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: garden().plants[0]!.flower.id, distance: 1 }));
      await screen.findByRole("dialog", { name: "rose" });
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true });
      expect(screen.queryByText(/for today’s achievement/)).toBeNull();
      await user.keyboard("{Escape}");
      expect(screen.getByText(/for today’s achievement: First seed planted/)).toBeInTheDocument();
    });
  });

  describe("a ♡ over flowers waiting on your care (#214)", () => {
    const ids = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    /** Rose (sprout, waiting), tulip (you cared), peony, bloomed daisy, closed moonflower, cactus your partner cared for. */
    function mixed(): GardenState {
      const state = garden();
      const rose = state.plants[0]!;
      rose.flower.growth_units = 0;
      const plant = (n: number, spot: number, type_key: string, extra: Partial<GardenState["plants"][number]["flower"]> = {}, you = false, partner = false) => ({
        ...structuredClone(rose),
        flower: { ...rose.flower, id: ids(n), spot, type_key, growth_units: 1, ...extra },
        member1_submitted: you,
        member2_submitted: partner,
      }) as GardenState["plants"][number];
      state.plants.push(
        plant(2, 2, "tulip", {}, true, false),
        plant(3, 3, "peony"),
        plant(4, 4, "daisy", { growth_units: 7, first_bloom_at: state.server_now, first_bloom_day: state.garden_day }),
        plant(5, 5, "moonflower"),
        plant(6, 6, "cactus", {}, false, true),
      );
      state.garden.next_spot = 7;
      return state;
    }
    async function refreshTo(next: GardenState) {
      api.refreshGardenV2.mockResolvedValue({ state: next, error: null });
      await act(async () => {
        window.dispatchEvent(new Event("focus"));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await flush();
    }

    it("floats one decorative ♡ over each flower whose care is open for you, sprouts included", async () => {
      const state = mixed();
      await mount(state);
      expect(hearts().map((heart) => heart.dataset.caption)).toEqual([`care-${ids(1)}`, `care-${ids(6)}`]);
      for (const heart of hearts()) {
        expect(heart).toHaveTextContent("♡");
        expect(heart).toHaveAttribute("aria-hidden", "true");
        expect(heart.tagName).toBe("SPAN");
      }
      // It never shadows the plot list's words or a control.
      expect(screen.queryByRole("button", { name: "♡" })).toBeNull();
    });

    it("sits just above the plant's top and follows it as it grows", async () => {
      await mount(mixed());
      const sprout = worlds[0]!.states.at(-1)!.flowers.find((flower) => flower.id === ids(1))!;
      // It grows: the same flower, three units on, stands taller.
      const grown = mixed();
      grown.plants[0]!.flower.growth_units = 3;
      await refreshTo(grown);
      const taller = worlds[0]!.states.at(-1)!.flowers.find((flower) => flower.id === ids(1))!;
      expect(taller.height!).toBeGreaterThan(sprout.height! * 1.5);
      const [before] = careHearts([mixed().plants[0]!], [sprout]);
      const [after] = careHearts([grown.plants[0]!], [taller]);
      expect(before).toMatchObject({ id: `care-${ids(1)}`, text: "♡", size: "mark" });
      expect(before!.position).toEqual([sprout.position[0], sprout.position[1] + sprout.height! + HEART_LIFT, sprout.position[2]]);
      expect(after!.position[1]).toBeCloseTo(taller.position[1] + taller.height! + HEART_LIFT, 6);
      expect(HEART_LIFT).toBeLessThan(0.1);
    });

    it("updates live: after your share, at the 4 a.m. rollover and when the Moonflower opens", async () => {
      const state = mixed();
      await mount(state);
      expect(hearts()).toHaveLength(2);
      // Your share on the rose (through the state your save returns, or Realtime).
      const shared = mixed();
      shared.plants[0]!.member1_submitted = true;
      await refreshTo(shared);
      expect(hearts().map((heart) => heart.dataset.caption)).toEqual([`care-${ids(6)}`]);
      // 10 p.m.: the Moonflower's window opens.
      const night = structuredClone(shared);
      night.moonflower_open = true;
      await refreshTo(night);
      expect(hearts().map((heart) => heart.dataset.caption)).toEqual([`care-${ids(5)}`, `care-${ids(6)}`]);
      // 4 a.m.: a new garden day, nobody has cared yet; the tulip waits again.
      const rollover = structuredClone(night);
      rollover.garden_day = "2026-11-03";
      rollover.moonflower_open = false;
      for (const plant of rollover.plants) {
        plant.member1_submitted = false;
        plant.member2_submitted = false;
      }
      await refreshTo(rollover);
      expect(hearts().map((heart) => heart.dataset.caption)).toEqual([`care-${ids(1)}`, `care-${ids(2)}`, `care-${ids(6)}`]);
    });

    it("hides under the glide, the flower view, planting and overlays, and comes back after", async () => {
      vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
      const user = userEvent.setup();
      await mount(mixed());
      expect(hearts()).toHaveLength(2);
      // Tapping a flower opens its activity directly, hiding world care marks.
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: ids(1), distance: 1 }));
      expect(screen.getByRole("dialog", { name: "rose" })).toBeInTheDocument();
      expect(captionIds()).toEqual(["title"]);
      await screen.findByRole("dialog", { name: "rose" }, { timeout: 3000 });
      expect(captionIds()).toEqual(["title"]);
      await user.keyboard("{Escape}");
      expect(hearts()).toHaveLength(2);
      act(() => worlds[0]!.callbacks.onFrame?.({ viewProjection: new Float32Array(16), width: 1280, height: 800, entryFade: 0, arrival: null, scenicReady: true }));
      // Planting an empty spot.
      act(() => worlds[0]!.callbacks.onPick({ kind: "spot", spot: -9, distance: 1 }));
      await screen.findByRole("dialog", { name: "plant a seed" }, { timeout: 3000 });
      expect(captionIds()).toEqual(["title"]);
      await user.keyboard("{Escape}");
      expect(hearts()).toHaveLength(2);
      // An overlay such as Memories.
      await user.click(screen.getByRole("link", { name: "memories" }));
      await screen.findByRole("dialog", { name: /memories/i });
      expect(captionIds()).toEqual(["title"]);
    });

    it("shows no care hearts when nothing waits on you", async () => {
      const state = mixed();
      for (const plant of state.plants) plant.member1_submitted = true;
      await mount(state);
      expect(captionIds().filter(id=>!id?.startsWith("route-"))).toEqual(["title", ...flowerTypes.map((type) => `area-${type}`)]);
    });
  });

  it("explains when the garden cannot load", () => {
    render(<GardenV2 initial={{ state: null, error: "The garden could not refresh." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The garden could not refresh.");
  });

  describe("a Dandelion's seeds blowing away (#201)", () => {
    function withDandelion(fulfilledBy: 1 | 2 | null): GardenState {
      const state = garden();
      const flower = state.plants[0]!.flower;
      Object.assign(flower, {
        type_key: "dandelion",
        shared_wish: "A synthetic wish",
        growth_units: 5,
        first_bloom_at: "2026-11-01T17:00:00Z",
        first_bloom_day: "2026-11-01",
        fulfilled_at: fulfilledBy ? "2026-11-02T17:00:00Z" : null,
        fulfilled_by: fulfilledBy,
      });
      return state;
    }

    it("blows them in the painting when you make the wish come true, then in the world as you return", async () => {
      const user = userEvent.setup();
      const state = withDandelion(null);
      const id = state.plants[0]!.flower.id;
      await mount(state, id);
      const dialog = await screen.findByRole("dialog", { name: "dandelion" });
      expect(studios.states.at(-1)!.seeds).toBeNull();
      expect(seeds.requests).toEqual([]);
      // While its painting is open, the world holds this flower's seeds back.
      expect(seeds.deferred.at(-1)).toBe(id);
      await user.click(within(dialog).getByRole("button", { name: "our wish came true" }));
      api.mutateGardenV2.mockResolvedValue({ state: withDandelion(1), saved: true, error: null });
      await user.click(within(dialog).getByRole("button", { name: "blow the seeds" }));
      await flush();
      expect(api.mutateGardenV2).toHaveBeenCalledWith({ kind: "fulfillDandelion", flowerId: id });
      const studio = studios.states.at(-1)!;
      expect(studio.seeds).toMatchObject({ token: expect.any(Number), seed: state.plants[0]!.flower.seed });
      expect(studio.seeds!.puff.puffSeeds.length).toBeGreaterThan(0);
      // The painting itself now shows the golden head.
      expect(studio.flowers[0]!.model.puffSeeds).toHaveLength(0);
      expect(seeds.requests.map((r) => r.id)).toEqual([id]);
      expect(window.localStorage.getItem("garden-v2:dandelion-seeds:1")).toBe(JSON.stringify({ ids: [id] }));

      // Returning: the world paints again and holds its close look while the seeds lift.
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false, focus: { position: expect.any(Array) } });
      expect(seeds.deferred.at(-1)).toBeNull();
      act(() => seeds.requests[0]!.onStart?.());
      // A seed hold still owns the camera; a click during it cannot open a new activity.
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id, distance: 1 }));
      expect(screen.queryByRole("dialog")).toBeNull();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1250)); });
      act(() => worlds[0]!.callbacks.onFrame?.({ viewProjection: new Float32Array(16), width: 1280, height: 800, entryFade: 0, arrival: null, scenicReady: true }));
      // Reopening the painting shows the golden head directly.
      act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id, distance: 1 }));
      await screen.findByRole("dialog", { name: "dandelion" });
      expect(studios.states.at(-1)!.seeds).toBeNull();
    });

    it("releases the camera when an overlay opens during the close-look hold", async () => {
      const user = userEvent.setup();
      const state = withDandelion(null);
      const id = state.plants[0]!.flower.id;
      await mount(state, id);
      const dialog = await screen.findByRole("dialog", { name: "dandelion" });
      await user.click(within(dialog).getByRole("button", { name: "our wish came true" }));
      api.mutateGardenV2.mockResolvedValue({ state: withDandelion(1), saved: true, error: null });
      await user.click(within(dialog).getByRole("button", { name: "blow the seeds" }));
      await flush();
      await user.keyboard("{Escape}");
      expect(worlds[0]!.states.at(-1)).toMatchObject({ focus: { position: expect.any(Array) } });
      // Memories opens during the hold: the camera is let go at once, and stays free after it closes.
      await user.click(screen.getByRole("link", { name: "memories" }));
      const memories = await screen.findByRole("dialog", { name: /memories/i });
      expect(worlds[0]!.states.at(-1)).toMatchObject({ focus: null });
      await user.click(within(memories).getAllByRole("button", { name: /close|back/i })[0]!);
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1300));
      });
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false, focus: null });
    });

    it("shows the partner a wish that came true once, the first time they see it", async () => {
      const state = withDandelion(2);
      const id = state.plants[0]!.flower.id;
      const first = await mount(state);
      expect(seeds.requests.map((r) => r.id)).toEqual([id]);
      // A direct visit has no arrival to wait for.
      expect(seeds.holds.at(-1)).toBe(false);
      // Remembered only once the world actually blows them.
      expect(window.localStorage.getItem("garden-v2:dandelion-seeds:1")).toBeNull();
      act(() => seeds.requests[0]!.onStart?.());
      expect(window.localStorage.getItem("garden-v2:dandelion-seeds:1")).toBe(JSON.stringify({ ids: [id] }));
      first.unmount();

      seeds.requests.length = 0;
      worlds.length = 0;
      await mount(state);
      expect(seeds.requests).toEqual([]);
    });

    it("plays in the painting for a partner who arrives by a link", async () => {
      const state = withDandelion(2);
      const id = state.plants[0]!.flower.id;
      await mount(state, id);
      await screen.findByRole("dialog", { name: "dandelion" });
      expect(studios.states.at(-1)!.seeds).toMatchObject({ token: expect.any(Number) });
      expect(window.localStorage.getItem("garden-v2:dandelion-seeds:1")).toBe(JSON.stringify({ ids: [id] }));
      // …and again in the world as they return.
      expect(seeds.requests.map((r) => r.id)).toEqual([id]);
    });

    it("never replays a wish you made come true yourself", async () => {
      await mount(withDandelion(1));
      expect(seeds.requests).toEqual([]);
    });

    it("shows an older wish's golden head directly, even in a fresh browser", async () => {
      const state = withDandelion(2);
      Object.assign(state.plants[0]!.flower, { first_bloom_at: "2026-10-10T17:00:00Z", first_bloom_day: "2026-10-10", fulfilled_at: "2026-10-20T17:00:00Z" });
      await mount(state);
      // The garden loaded (the Dandelion is there), but nothing waits to blow.
      expect(screen.getByRole("button", { name: /^dandelion,/ })).toBeInTheDocument();
      expect(seeds.requests).toEqual([]);
    });
  });
});

it("shares native scroll with the picture/name picker and has no stop/free-walking chrome", async () => {
  stubReducedMotion();const state=v2GardenFixture();api.refreshGardenV2.mockResolvedValue({state,error:null});
  render(<GardenV2 initial={{state,error:null}} />);await flush();await act(async()=>worlds.at(-1)!.callbacks.onReady());await flush();
  expect(worlds.at(-1)!.states.at(-1)!.walking).not.toBe(true);
  expect(worlds.at(-1)!.states.at(-1)!.tour!.anchors.size).toBe(13);
  expect(screen.queryByRole("navigation",{name:"Garden path"})).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox",{name:"Scenic stop"})).not.toBeInTheDocument();
  const scroll=screen.getByLabelText('Scroll through the garden');scroll.scrollTop=240;fireEvent.scroll(scroll);
  const distance=worlds.at(-1)!.states.at(-1)!.tourDistance;expect(distance).toBeGreaterThan(0);
  const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Choose a flower'}));
  const picker=screen.getByRole('dialog',{name:'Choose a flower'});const options=within(picker).getAllByRole('button');expect(options).toHaveLength(13);
  expect(options.map(button=>button.querySelector('img')?.getAttribute('src'))).toEqual(flowerTypes.map(type=>`/flowers/picker/${type}.webp`));
  for(const option of options)expect(option.children).toHaveLength(2);
  picker.scrollTop=100;fireEvent.scroll(picker);expect(worlds.at(-1)!.states.at(-1)!.tourDistance).toBe(distance);
  await user.keyboard('{Escape}');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'Choose a flower'})).toHaveFocus();
  await user.click(screen.getByRole('link',{name:'settings'}));scroll.scrollTop=500;fireEvent.scroll(scroll);expect(worlds.at(-1)!.states.at(-1)!.tourDistance).toBe(distance);
});

it('blocks another plot activation during normal return, then accepts it when the renderer settles',async()=>{
 vi.stubGlobal('matchMedia',(query:string)=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 await mount();const user=userEvent.setup();
 await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="1"]')!);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,1000));});
 expect(screen.getByRole('dialog',{name:'rose'})).toBeInTheDocument();
 await user.keyboard('{Escape}');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 const scroll=screen.getByLabelText('Scroll through the garden'),before=worlds[0]!.states.at(-1)!.tourDistance;scroll.scrollTop+=400;fireEvent.scroll(scroll);expect(worlds[0]!.states.at(-1)!.tourDistance).toBe(before);
 await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="-1"]')!);
 expect(worlds[0]!.states.at(-1)!.focus).toBeNull();
 act(()=>worlds[0]!.callbacks.onFrame?.({viewProjection:new Float32Array(16),width:1280,height:800,entryFade:0,arrival:null,scenicReady:true}));
 await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="-1"]')!);
 expect(worlds[0]!.states.at(-1)!.focus).not.toBeNull();
});

it('keeps accessible plot visits usable after closing while the world is still loading',async()=>{
 vi.stubGlobal('matchMedia',(query:string)=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 const state=garden();api.refreshGardenV2.mockResolvedValue({state,error:null});render(<GardenV2 initial={{state,error:null}} />);await flush();await flush();const user=userEvent.setup();
 await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="1"]')!);await screen.findByRole('dialog',{name:'rose'});await user.keyboard('{Escape}');
 await user.click(document.querySelector<HTMLButtonElement>('[data-plot-spot="-1"]')!);await screen.findByRole('dialog',{name:'plant a seed'});
});
