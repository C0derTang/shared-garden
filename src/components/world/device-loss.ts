/** The part of a vgpu `Gpu` the loss watcher needs. */
export interface LossObservable {
  readonly lost: Promise<GPUDeviceLostInfo>;
}

/**
 * Calls `onLost` once if the device is lost while the renderer is still alive.
 * vgpu stops its frame loops before resolving `gpu.lost`, so without this the
 * canvas would silently freeze. Our own teardown (dispose) is ignored because
 * `isDisposed()` is already true by then, and vgpu leaves `lost` pending after
 * `gpu.dispose()`.
 */
export function watchDeviceLoss(gpu: LossObservable, isDisposed: () => boolean, onLost: (info: GPUDeviceLostInfo) => void): void {
  void gpu.lost.then((info) => {
    if (!isDisposed()) onLost(info);
  });
}

/** Largest DPR that keeps a canvas of `cssSize` within the device's 2D texture limit. */
export function maxDprFor(cssSize: number, maxTextureDimension2D: number, cap = 2): number {
  if (!(cssSize > 0) || !(maxTextureDimension2D > 0)) return 1;
  return Math.max(0.5, Math.min(cap, Math.floor((maxTextureDimension2D / cssSize) * 100) / 100));
}
