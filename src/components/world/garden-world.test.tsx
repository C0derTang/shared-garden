import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GardenWorld, hasWebGpu } from "./garden-world";

describe("GardenWorld", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a notice linking to the legacy garden without WebGPU", async () => {
    expect(hasWebGpu()).toBe(false);
    render(<GardenWorld />);
    expect(await screen.findByText("This garden is painted with WebGPU.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the earlier garden" })).toHaveAttribute("href", "/legacy");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("detects WebGPU when the browser exposes it", () => {
    vi.stubGlobal("navigator", { ...navigator, gpu: {} });
    expect(hasWebGpu()).toBe(true);
  });
});
