import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioState } from "@/components/world/flowers/studio-renderer";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { awayKey, takeAwaySnapshot } from "@/lib/garden-v2/away";
import type { GardenState } from "@/lib/garden-v2/model";
import type { GardenView } from "@/lib/garden-v2/views";
import { guideKey } from "@/lib/garden-v2/views";
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

const { GardenV2 } = await import("./garden-v2");

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

describe("GardenV2", () => {
  it("paints the garden with no floating names and lists every plot in a hidden keyboard list", async () => {
    const { state } = await mount();
    const scene = worlds[0]!.states.at(-1)!;
    expect(scene).toMatchObject({ spotCapacity: 12, occupiedSpots: [1], paused: false, focus: null });
    expect(scene).not.toHaveProperty("selected");
    expect(scene.flowers.map((f) => f.id)).toEqual([state.plants[0]!.flower.id]);
    // Only the world's title floats in the scene; no names over the plants or seed marks (#206).
    expect([...document.querySelectorAll("[data-caption]")].map((element) => element.getAttribute("data-caption"))).toEqual(["title"]);
    expect(screen.queryByRole("link", { name: /^rose/i })).toBeNull();
    // No plot navigator (#210): no listbox, chevrons or visit/plant controls.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /previous plot|next plot|^visit$|^plant$/i })).toBeNull();
    // Every plot is in the hidden list, in reading order, with its full name.
    const list = screen.getByRole("navigation", { name: "Plots in the garden" });
    const plots = within(list).getAllByRole("button");
    expect(plots).toHaveLength(12);
    expect(within(list).getByRole("button", { name: /^rose, in bud, 2 of 5\. Your care is open; partner cared today\. Bed 1$/ })).toHaveTextContent("rose · 2 of 5 ♡ · bed 1");
    expect(within(list).getAllByRole("button", { name: "Empty spot, bed 1" })).toHaveLength(11);
    expect(within(list).getAllByRole("button", { name: "Empty spot, bed 1" })[0]).toHaveTextContent("empty spot · bed 1");
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

  it("returns focus to the hidden plot with motion on, after the glide and the close", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const user = userEvent.setup();
    await mount();
    const rose = within(screen.getByRole("navigation", { name: "Plots in the garden" })).getByRole("button", { name: /^rose,/ });
    rose.focus();
    await user.keyboard("{Enter}");
    // The camera glides first; the split view opens after it.
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = await screen.findByRole("dialog", { name: "rose" }, { timeout: 3000 });
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
    const empty = within(screen.getByRole("navigation", { name: "Plots in the garden" })).getAllByRole("button", { name: "Empty spot, bed 1" })[0]!;
    empty.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("dialog", { name: "plant a seed" })).toBeInTheDocument();
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
    act(() => worlds[0]!.callbacks.onPick({ kind: "spot", spot: 2, distance: 1 }));
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
