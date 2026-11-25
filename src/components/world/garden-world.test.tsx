import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks } from "./renderer";

// The real renderer needs WebGPU and .wgsl imports; record its callbacks instead.
const created: WorldRendererCallbacks[] = [];
const disposals = vi.fn();
const moves = { travel: vi.fn(), pan: vi.fn() };
const updates: unknown[] = [];
vi.mock("./renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, _state: unknown, callbacks: WorldRendererCallbacks) => {
    created.push(callbacks);
    return { update: (next: unknown) => updates.push(next), travel: moves.travel, pan: moves.pan, dispose: disposals };
  },
}));

const { DEVICE_LOSS_RECOVERIES, GardenWorld, hasWebGpu } = await import("./garden-world");

const lost = { reason: "unknown", message: "test loss" } as GPUDeviceLostInfo;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("GardenWorld without WebGPU", () => {
  it("shows a notice linking to the legacy garden", async () => {
    expect(hasWebGpu()).toBe(false);
    render(<GardenWorld />);
    expect(await screen.findByText("This garden is painted with WebGPU.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the earlier garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("GardenWorld with WebGPU", () => {
  beforeEach(() => {
    created.length = 0;
    disposals.mockClear();
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects WebGPU and starts the renderer", async () => {
    expect(hasWebGpu()).toBe(true);
    render(<GardenWorld />);
    await flush();
    expect(created).toHaveLength(1);
    act(() => created[0]!.onReady());
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("recreates the GPU context once after a device loss, then shows the stopped notice", async () => {
    expect(DEVICE_LOSS_RECOVERIES).toBe(1);
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());

    act(() => created[0]!.onLost(lost));
    await flush();
    expect(created).toHaveLength(2);
    act(() => created[1]!.onReady());
    expect(screen.getByRole("img")).toBeInTheDocument();

    act(() => created[1]!.onLost(lost));
    await flush();
    expect(created).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("The painted garden stopped.");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the earlier garden" })).toHaveAttribute("href", "/legacy");
  });

  it("distinguishes a runtime error from an unsupported browser", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onError(new Error("boom")));
    expect(screen.getByText("The painted garden stopped.")).toBeInTheDocument();
    expect(screen.queryByText("This garden is painted with WebGPU.")).not.toBeInTheDocument();
  });

  it("shows the unsupported notice when no adapter is available", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onUnsupported(new Error("no adapter")));
    expect(screen.getByText("This garden is painted with WebGPU.")).toBeInTheDocument();
  });

  it("disposes the renderer on unmount", async () => {
    const { unmount } = render(<GardenWorld />);
    await flush();
    unmount();
    expect(disposals).toHaveBeenCalled();
  });

  it("shows the stopped notice, not the unsupported one, when the restart after a loss finds no GPU", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());
    act(() => created[0]!.onLost(lost));
    await flush();
    act(() => created[1]!.onUnsupported(new Error("no adapter after the loss")));
    expect(screen.getByRole("alert")).toHaveTextContent("The painted garden stopped.");
    expect(screen.queryByText("This garden is painted with WebGPU.")).not.toBeInTheDocument();
  });

  it("walks in with up and down and along the beds with left and right", async () => {
    render(<GardenWorld />);
    await flush();
    act(() => created[0]!.onReady());
    moves.travel.mockClear();
    moves.pan.mockClear();
    const world = screen.getByLabelText(/left and right to walk along the beds/);
    act(() => {
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
      world.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(moves.travel).toHaveBeenCalledWith(expect.any(Number));
    expect(moves.pan.mock.calls.map(([d]) => Math.sign(d as number))).toEqual([-1, 1]);
  });

  it("passes the camera focus and pause to the renderer", async () => {
    const focus = { position: [1, 0, 2] as [number, number, number], height: 0.8 };
    const { rerender } = render(<GardenWorld />);
    await flush();
    updates.length = 0;
    rerender(<GardenWorld focus={focus} paused />);
    expect(updates.at(-1)).toMatchObject({ focus, paused: true });
  });

  it("renders link captions that still work as links and run their handler on a plain click", async () => {
    const select = vi.fn();
    render(<GardenWorld captions={[{ id: "come-in", text: "come in", position: [0, 1, 0], href: "/garden", onSelect: select }]} />);
    await flush();
    const link = screen.getByRole("link", { name: "come in" });
    expect(link).toHaveAttribute("href", "/garden");
    expect(link).toHaveAttribute("data-caption", "come-in");
    act(() => link.click());
    expect(select).toHaveBeenCalledTimes(1);
  });
});
