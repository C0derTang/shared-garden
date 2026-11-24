import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("paints the garden with no floating names and lists every plot in the navigator", async () => {
    const { state } = await mount();
    const scene = worlds[0]!.states.at(-1)!;
    expect(scene).toMatchObject({ spotCapacity: 12, occupiedSpots: [1], paused: false, focus: null, selected: null });
    expect(scene.flowers.map((f) => f.id)).toEqual([state.plants[0]!.flower.id]);
    // Only the world's title floats in the scene; no names over the plants or seed marks (#206).
    expect([...document.querySelectorAll("[data-caption]")].map((element) => element.getAttribute("data-caption"))).toEqual(["title"]);
    expect(screen.queryByRole("link", { name: /^rose/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /plant a seed/i })).toBeNull();
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    const options = within(list).getAllByRole("option");
    expect(options).toHaveLength(12);
    expect(within(list).getByRole("option", { name: /^rose, in bud, 2 of 5\. Your care is open; partner cared today\. Bed 1$/ })).toHaveTextContent("rose · 2 of 5 ♡");
    expect(within(list).getAllByRole("option", { name: "Empty spot, bed 1" })).toHaveLength(11);
    expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByText(/dev showcase/i)).toBeNull();
  });

  it("steps through the plots, framing each one, and visits a flower with Enter", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    const rose = state.plants[0]!.flower;
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    list.focus();
    await user.keyboard("{ArrowDown}");
    const first = worlds[0]!.states.at(-1)!.selected!;
    expect(first).toMatchObject({ spot: expect.any(Number) });
    expect(list).toHaveAttribute("aria-activedescendant", within(list).getByRole("option", { selected: true }).id);
    // Step until the rose is selected; the world frames it and lights it like the hovered plot.
    for (let i = 0; i < 12 && !within(list).getByRole("option", { selected: true }).getAttribute("aria-label")!.startsWith("rose"); i += 1) {
      await user.keyboard("{ArrowDown}");
    }
    expect(worlds[0]!.states.at(-1)!.selected).toMatchObject({ spot: 1, flowerId: rose.id, height: expect.any(Number) });
    expect(screen.getByRole("button", { name: "visit" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "rose" });
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true, focus: { position: expect.any(Array) }, selected: { spot: 1 } });
    expect(window.location.search).toBe(`?flower=${rose.id}`);
    expect(within(dialog).getByRole("img", { name: /The rose, in bud/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "rose" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Back to the framed plot, with focus on the navigator.
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false, focus: null, selected: { spot: 1 } });
    expect(window.location.search).toBe("");
    expect(document.activeElement).toBe(list);
    // Escape from the navigator returns to the whole garden.
    await user.keyboard("{Escape}");
    expect(worlds[0]!.states.at(-1)!.selected).toBeNull();
    expect(list).not.toHaveAttribute("aria-activedescendant");
  });

  it("marks a flower whose care is open for you, and keeps the Peony quiet", async () => {
    const user = userEvent.setup();
    const state = garden();
    const rose = state.plants[0]!;
    state.plants.push(
      { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000bb", spot: 2, type_key: "sunflower" }, member2_submitted: false },
      { ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000cc", spot: 3, type_key: "peony" }, member2_submitted: false },
    );
    state.garden.next_spot = 4;
    await mount(state);
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    const sunflower = within(list).getByRole("option", { name: /^sunflower,/ });
    expect(sunflower.getAttribute("aria-label")).toMatch(/Your care is open/);
    const peony = within(list).getByRole("option", { name: /^peony,/ });
    expect(peony.getAttribute("aria-label")).not.toMatch(/care|cared/i);
    const navigator = list.closest("[data-plot-navigator]")!;
    list.focus();
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < 12; i += 1) {
      await user.keyboard("{ArrowDown}");
      const name = within(list).getByRole("option", { selected: true }).getAttribute("aria-label")!.split(",")[0]!;
      seen[name] = navigator.hasAttribute("data-due");
    }
    expect(seen).toMatchObject({ sunflower: true, peony: false });
  });

  it("plants on an empty plot from the navigator", async () => {
    const user = userEvent.setup();
    await mount();
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    list.focus();
    await user.keyboard("{Home}");
    if (within(list).getByRole("option", { selected: true }).getAttribute("aria-label")!.startsWith("rose")) await user.keyboard("{ArrowDown}");
    expect(within(list).getByRole("option", { selected: true })).toHaveTextContent("empty spot");
    const spot = worlds[0]!.states.at(-1)!.selected!.spot;
    expect(worlds[0]!.states.at(-1)!.selected).toMatchObject({ flowerId: null, height: 0 });
    await user.click(screen.getByRole("button", { name: "plant" }));
    expect(await screen.findByRole("dialog", { name: "plant a seed" })).toBeInTheDocument();
    expect(spot).toBeGreaterThan(1);
  });

  it("keeps direct taps in the world working, and lets the framing go when you wander off", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    const list = screen.getByRole("listbox", { name: "Plots in the garden" });
    list.focus();
    await user.keyboard("{ArrowDown}");
    expect(worlds[0]!.states.at(-1)!.selected).not.toBeNull();
    // Tapping the rose in the world moves the navigator there and opens it.
    act(() => worlds[0]!.callbacks.onPick({ kind: "flower", id: state.plants[0]!.flower.id, distance: 1 }));
    expect(await screen.findByRole("dialog", { name: "rose" })).toBeInTheDocument();
    expect(worlds[0]!.states.at(-1)!.selected).toMatchObject({ spot: 1 });
    await user.keyboard("{Escape}");
    // Scrolling or dragging the world while a plot is framed lets the framing go.
    act(() => worlds[0]!.callbacks.onWander?.());
    expect(worlds[0]!.states.at(-1)!.selected).toBeNull();
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
});
