import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";
import { awayKey, takeAwaySnapshot } from "@/lib/garden-v2/away";
import type { GardenState } from "@/lib/garden-v2/model";
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
const api = vi.hoisted(() => ({
  refreshGardenV2: vi.fn(),
  mutateGardenV2: vi.fn(),
  loadFlowerHistoryV2: vi.fn(),
  readRepliesV2: vi.fn(),
  saveReplyV2: vi.fn(),
}));
vi.mock("@/lib/garden-v2/actions", () => api);
// The garden's overlays (#183) and the private moment read through their own actions.
vi.mock("@/lib/garden-v2/achievement-actions", () => ({ readAchievementsV2: vi.fn(async () => ({ state: null, error: null })) }));
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

  it("explains when the garden cannot load", () => {
    render(<GardenV2 initial={{ state: null, error: "The garden could not refresh." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("The garden could not refresh.");
  });
});
