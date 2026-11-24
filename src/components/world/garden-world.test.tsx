import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorldRendererCallbacks } from "./renderer";

// The real renderer needs WebGPU and .wgsl imports; record its callbacks instead.
const created: WorldRendererCallbacks[] = [];
const disposals = vi.fn();
vi.mock("./renderer", () => ({
  createWorldRenderer: (_canvas: HTMLCanvasElement, _state: unknown, callbacks: WorldRendererCallbacks) => {
    created.push(callbacks);
    return { update: vi.fn(), travel: vi.fn(), dispose: disposals };
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
});
