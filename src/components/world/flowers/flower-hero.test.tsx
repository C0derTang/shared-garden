import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioCallbacks, StudioState } from "./studio-renderer";

// The real studio needs WebGPU and .wgsl imports; record what it is given instead.
const created: { state: StudioState; callbacks: StudioCallbacks }[] = [];
const updates = vi.fn();
const disposals = vi.fn();
vi.mock("./studio-renderer", () => ({
  createStudioRenderer: (_canvas: HTMLCanvasElement, state: StudioState, callbacks: StudioCallbacks) => {
    created.push({ state, callbacks });
    return { update: updates, dispose: disposals };
  },
}));

const { FlowerHero, heroCamera } = await import("./flower-hero");
const { flowerModel } = await import("./flower-models");

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("FlowerHero", () => {
  it("explains when WebGPU is missing", async () => {
    render(<FlowerHero spec={{ type: "rose", seed: 1, growth: 1 }} />);
    expect(await screen.findByRole("status")).toHaveTextContent("WebGPU");
  });

  describe("with WebGPU", () => {
    beforeEach(() => {
      created.length = 0;
      disposals.mockClear();
      vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("renders one flower large, slowly orbiting, with its aura", async () => {
      const { unmount } = render(<FlowerHero spec={{ type: "peony", seed: 9, growth: 1 }} label="Peony in bloom" />);
      await flush();
      expect(created).toHaveLength(1);
      const { state } = created[0]!;
      expect(state.flowers).toHaveLength(1);
      expect(state.flowers[0]!.model).toBe(flowerModel({ type: "peony", seed: 9, growth: 1 }));
      expect(state.camera.kind).toBe("orbit");
      expect(state.aura).toBeGreaterThan(0);
      act(() => created[0]!.callbacks.onReady());
      expect(screen.getByRole("img", { name: "Peony in bloom" })).toBeInTheDocument();
      unmount();
      expect(disposals).toHaveBeenCalled();
    });
  });

  it("frames the whole plant or a close-up of the bloom", () => {
    const model = flowerModel({ type: "sunflower", seed: 4, growth: 1 });
    const plant = heroCamera(model, "plant");
    const bloom = heroCamera(model, "bloom");
    if (plant.kind !== "orbit" || bloom.kind !== "orbit") throw new Error("hero cameras orbit");
    expect(bloom.distance).toBeLessThan(plant.distance);
    expect(plant.spin).toBeGreaterThan(0);
    // Seedlings have no bloom yet, so they fall back to the whole plant.
    const seedling = flowerModel({ type: "sunflower", seed: 4, growth: 0.1 });
    expect(heroCamera(seedling, "bloom")).toEqual(heroCamera(seedling, "plant"));
  });
});
