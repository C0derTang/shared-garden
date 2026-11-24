import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks, WorldSceneState } from "@/components/world/renderer";

const { push, prefetch } = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch }) }));

// The real renderer needs WebGPU and .wgsl imports; record what the landing asks of it.
const created: { callbacks: WorldRendererCallbacks; states: WorldSceneState[] }[] = [];
vi.mock("@/components/world/renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, state: WorldSceneState, callbacks: WorldRendererCallbacks) => {
    const record = { callbacks, states: [state] };
    created.push(record);
    return { update: (next: WorldSceneState) => record.states.push(next), travel: vi.fn(), dispose: vi.fn() };
  },
}));

const { CROSSFADE_MS, GARDEN_PATH, LakesideLanding, WALK_SAFETY_MS } = await import("./lakeside-landing");

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

beforeEach(() => {
  push.mockClear();
  prefetch.mockClear();
  created.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("without WebGPU", () => {
  it("still gives visitors a working Log in and nothing else", async () => {
    render(<LakesideLanding member={false} />);
    const button = await screen.findByRole("button", { name: "log in" });
    const form = button.closest("form");
    expect(form).toHaveAttribute("action", "/auth/start");
    expect(form).toHaveAttribute("method", "post");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("This house is painted with WebGPU.");
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("gives members links to the garden and the old garden", async () => {
    render(<LakesideLanding member />);
    expect(await screen.findByRole("link", { name: "come in" })).toHaveAttribute("href", GARDEN_PATH);
    expect(screen.getAllByRole("link", { name: "old garden" })[0]).toHaveAttribute("href", "/legacy");
    expect(screen.queryByRole("button", { name: "log in" })).toBeNull();
  });
});

describe("with WebGPU", () => {
  beforeEach(() => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
  });

  it("paints the landing composition and floats Log in for visitors before the world is ready", async () => {
    render(<LakesideLanding member={false} />);
    await flush();
    expect(created).toHaveLength(1);
    expect(created[0]!.states[0]).toMatchObject({ composition: "landing", doorInvite: false, entering: false });
    // A native form, shown at its standby spot while the GPU starts.
    expect(screen.getByRole("button", { name: "log in" }).closest("form")).toHaveAttribute("action", "/auth/start");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("walks members through the door, then opens the garden", async () => {
    stubReducedMotion(false);
    const user = userEvent.setup();
    render(<LakesideLanding member />);
    await flush();
    const world = created[0]!;
    expect(world.states[0]).toMatchObject({ composition: "landing", doorInvite: true });
    expect(prefetch).toHaveBeenCalledWith(GARDEN_PATH);
    act(() => world.callbacks.onReady());

    // "come in" is a real link to the garden that scripts enhance into the walk-through.
    const link = screen.getByRole("link", { name: "come in" });
    expect(link).toHaveAttribute("href", GARDEN_PATH);
    await user.click(link);
    expect(world.states.at(-1)).toMatchObject({ entering: true, doorInvite: false });
    expect(screen.queryByRole("link", { name: "come in" })).toBeNull();
    expect(screen.getByText(/Walking into the garden/)).toHaveAttribute("aria-live", "polite");
    expect(push).not.toHaveBeenCalled();

    act(() => world.callbacks.onFrame?.({ viewProjection: new Float32Array(16), width: 100, height: 100, entryFade: 0.5 }));
    act(() => world.callbacks.onEntered?.());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(GARDEN_PATH);
  });

  it("also enters when the painted door itself is tapped", async () => {
    stubReducedMotion(false);
    render(<LakesideLanding member />);
    await flush();
    const world = created[0]!;
    act(() => world.callbacks.onReady());
    act(() => world.callbacks.onPick({ kind: "door", distance: 10 }));
    expect(world.states.at(-1)).toMatchObject({ entering: true });
  });

  it("crossfades instead of walking under reduced motion", async () => {
    stubReducedMotion(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LakesideLanding member />);
    await flush();
    const world = created[0]!;
    act(() => world.callbacks.onReady());
    act(() => screen.getByRole("link", { name: "come in" }).click());
    expect(screen.getByRole("main")).toHaveAttribute("data-phase", "fading");
    expect(world.states.at(-1)?.entering).toBe(false);
    expect(push).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CROSSFADE_MS));
    expect(push).toHaveBeenCalledWith(GARDEN_PATH);
  });

  it("navigates after the safety delay if the walk-through never reports its end", async () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LakesideLanding member />);
    await flush();
    act(() => created[0]!.callbacks.onReady());
    act(() => screen.getByRole("link", { name: "come in" }).click());
    expect(screen.getByRole("main")).toHaveAttribute("data-phase", "walking");
    act(() => vi.advanceTimersByTime(WALK_SAFETY_MS - 1));
    expect(push).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(GARDEN_PATH);
  });

  it("navigates once when the walk-through ends and the safety timer also fires", async () => {
    stubReducedMotion(false);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<LakesideLanding member />);
    await flush();
    const world = created[0]!;
    act(() => world.callbacks.onReady());
    act(() => screen.getByRole("link", { name: "come in" }).click());
    act(() => vi.advanceTimersByTime(WALK_SAFETY_MS - 5));
    act(() => world.callbacks.onEntered?.());
    act(() => vi.advanceTimersByTime(10));
    act(() => world.callbacks.onEntered?.());
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("shows members links if the painting stops", async () => {
    render(<LakesideLanding member />);
    await flush();
    act(() => created[0]!.callbacks.onError(new Error("boom")));
    expect(screen.getByRole("alert")).toHaveTextContent("The painting stopped.");
    expect(screen.getByRole("link", { name: "come in" })).toHaveAttribute("href", GARDEN_PATH);
    expect(screen.getByRole("button", { name: "reload" })).toBeInTheDocument();
  });
});
