import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { awayKey, takeAwaySnapshot } from "@/lib/garden-v2/away";
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
vi.mock("@/lib/garden-v2/achievement-actions", () => ({ readAwardsForDayV2: fireworks.readAwardsForDayV2, readAchievementsV2: vi.fn() }));
const api = vi.hoisted(() => ({
  refreshGardenV2: vi.fn(),
  mutateGardenV2: vi.fn(),
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => api);
vi.mock("@/lib/replies/actions", () => ({ readReplies: vi.fn(), saveReply: vi.fn() }));
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

async function mount(state = garden(), initialFlowerId: string | null = null) {
  api.refreshGardenV2.mockResolvedValue({ state, error: null });
  const view = render(<GardenV2 initial={{ state, error: null }} initialFlowerId={initialFlowerId} />);
  await flush();
  await flush();
  act(() => worlds[0]!.callbacks.onReady());
  return { ...view, state };
}

describe("GardenV2", () => {
  it("paints the garden with every flower and an open spot as floating words", async () => {
    const { state } = await mount();
    const scene = worlds[0]!.states.at(-1)!;
    expect(scene).toMatchObject({ spotCapacity: 12, occupiedSpots: [1], paused: false, focus: null });
    expect(scene.flowers.map((f) => f.id)).toEqual([state.plants[0]!.flower.id]);
    const rose = screen.getByRole("link", { name: /^rose, in bud, 2 of 5\. Your care is open; partner cared today/ });
    expect(rose).toHaveAttribute("href", `/garden?flower=${state.plants[0]!.flower.id}`);
    expect(rose).toHaveTextContent("rose ♡");
    expect(screen.getByRole("button", { name: "Plant a seed in spot 2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "old garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByText(/dev showcase/i)).toBeNull();
  });

  it("never shows a flower without its activity yet as due", async () => {
    const state = garden();
    const rose = state.plants[0]!;
    state.plants.push({ ...structuredClone(rose), flower: { ...rose.flower, id: "00000000-0000-4000-8000-0000000000bb", spot: 2, type_key: "sunflower" }, member2_submitted: false });
    await mount(state);
    const sunflower = screen.getByRole("link", { name: /^sunflower,/ });
    expect(sunflower.getAttribute("aria-label")).not.toMatch(/care|cared/i);
    expect(sunflower.className).toMatch(/quiet/);
    expect(screen.getByRole("link", { name: /^rose,/ }).className).not.toMatch(/quiet/);
  });

  it("glides to a flower, opens its split view, and returns focus when Escape closes it", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    const rose = screen.getByRole("link", { name: /^rose,/ });
    rose.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: "rose" });
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: true, focus: { position: expect.any(Array) } });
    expect(window.location.search).toBe(`?flower=${state.plants[0]!.flower.id}`);
    expect(within(dialog).getByRole("img", { name: /The rose, in bud/ })).toBeInTheDocument();
    expect(within(dialog).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { name: "rose" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(worlds[0]!.states.at(-1)).toMatchObject({ paused: false, focus: null });
    expect(window.location.search).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("link", { name: /^rose,/ }));
  });

  it("opens a deep-linked flower straight away", async () => {
    const state = garden();
    await mount(state, state.plants[0]!.flower.id);
    expect(await screen.findByRole("dialog", { name: "rose" })).toBeInTheDocument();
  });

  it("plants any flower on an empty spot, asking a Dandelion for its wish", async () => {
    const user = userEvent.setup();
    const { state } = await mount();
    await user.click(screen.getByRole("button", { name: "Plant a seed in spot 2" }));
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
      await user.click(screen.getByRole("link", { name: /^rose,/ }));
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
