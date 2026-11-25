import { describe, expect, it, vi } from "vitest";
import { maxDprFor, watchDeviceLoss } from "./device-loss";

const info = { reason: "unknown", message: "lost for a test" } as GPUDeviceLostInfo;

describe("watchDeviceLoss", () => {
  it("reports a loss while the renderer is alive", async () => {
    const onLost = vi.fn();
    watchDeviceLoss({ lost: Promise.resolve(info) }, () => false, onLost);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLost).toHaveBeenCalledWith(info);
  });

  it("ignores a loss after the renderer disposed itself", async () => {
    const onLost = vi.fn();
    watchDeviceLoss({ lost: Promise.resolve(info) }, () => true, onLost);
    await Promise.resolve();
    await Promise.resolve();
    expect(onLost).not.toHaveBeenCalled();
  });

  it("stays quiet while the device is healthy", async () => {
    const onLost = vi.fn();
    watchDeviceLoss({ lost: new Promise<GPUDeviceLostInfo>(() => undefined) }, () => false, onLost);
    await Promise.resolve();
    expect(onLost).not.toHaveBeenCalled();
  });
});

describe("maxDprFor", () => {
  it("allows the full cap on ordinary screens", () => {
    expect(maxDprFor(1440, 8192)).toBe(2);
  });

  it("keeps very large canvases within the texture limit", () => {
    const dpr = maxDprFor(5120, 8192);
    expect(dpr).toBeLessThan(2);
    expect(5120 * dpr).toBeLessThanOrEqual(8192);
  });

  it("falls back to 1 for unknown sizes", () => {
    expect(maxDprFor(0, 8192)).toBe(1);
  });
});
