/** A layout remap can land between the browser's representable CSS pixels.
 * Keep that conversion phase until the next remap; native deltas stay native.
 * Home/End use the actual DOM bounds, including its rounded scroll height. */
export function nativeToTourPixels(native: number, phase: number, nativeMax: number, tourMax: number): number {
  if (native <= 0) return 0;
  if (native >= nativeMax) return tourMax;
  return Math.max(0, Math.min(tourMax, native + phase));
}

export function tourToNativePixels(pixels: number, phase: number, nativeMax: number, tourMax: number): number {
  if (pixels <= 0) return 0;
  if (pixels >= tourMax) return nativeMax;
  return Math.max(0, Math.min(nativeMax, pixels - phase));
}
