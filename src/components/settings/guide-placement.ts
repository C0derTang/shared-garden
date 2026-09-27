/** Where the coach-mark bubble goes (decision 0056). Pure, so it is unit-tested. */
export type Side = "below" | "above" | "right" | "left" | "dock";
export type Rect = { left: number; top: number; width: number; height: number };
export type PlacementInput = {
  /** The highlighted spot, or null when it cannot be measured. */
  target: Rect | null;
  /** The bubble's full content height at `width`, borders included. */
  bubbleHeight: number;
  viewWidth: number;
  viewHeight: number;
  /** The band the bubble may use: below the garden header, above the hotbar. */
  safeTop: number;
  safeBottom: number;
  /** The lowest the flower may reach: above the hotbar and the Today card,
      which the dimmed bubble may cover but the lit flower must not sit under.
      Defaults to safeBottom. */
  flowerBottom?: number;
};
export type Placement = {
  side: Side;
  bubble: { left: number; top: number; width: number; maxHeight: number };
  /** The pointer's top-left corner; absent when docked. */
  arrow?: { left: number; top: number };
};

export const bubbleGap = 14;
export const bubbleGutter = 12;
export const bubbleMaxWidth = 340;
const arrowInset = 18;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Tries below, then above (the roomier one first), then beside the flower,
 * and uses the first side where the whole bubble fits inside the safe band
 * without covering the flower. Otherwise it docks in the safe band, where it
 * may cover the flower but never the header or hotbar.
 */
export function placeBubble({ target, bubbleHeight, viewWidth, viewHeight, safeTop, safeBottom, flowerBottom = safeBottom }: PlacementInput): Placement {
  const width = Math.min(bubbleMaxWidth, viewWidth - bubbleGutter * 2);
  const band = Math.max(0, safeBottom - safeTop);
  const height = Math.min(bubbleHeight, band);
  const dock: Placement = {
    side: "dock",
    bubble: { left: (viewWidth - width) / 2, top: clamp(safeBottom - height, safeTop, safeBottom), width, maxHeight: band },
  };
  if (!target) return dock;
  // A flower cut off by the header, hotbar or Today card cannot be pointed at.
  if (target.top < safeTop || target.top + target.height > Math.min(flowerBottom, safeBottom)) return dock;
  const centerX = target.left + target.width / 2;
  const centerY = target.top + target.height / 2;
  const bottom = target.top + target.height;
  const right = target.left + target.width;
  const horizontal = clamp(centerX - width / 2, bubbleGutter, viewWidth - bubbleGutter - width);
  const pointerX = clamp(centerX, horizontal + arrowInset, horizontal + width - arrowInset) - 9;
  const vertical: Placement[] = [];
  if (bottom + bubbleGap + bubbleHeight <= safeBottom) {
    const top = bottom + bubbleGap;
    vertical.push({ side: "below", bubble: { left: horizontal, top, width, maxHeight: bubbleHeight }, arrow: { left: pointerX, top: top - 10 } });
  }
  if (target.top - bubbleGap - bubbleHeight >= safeTop) {
    const top = target.top - bubbleGap - bubbleHeight;
    vertical.push({ side: "above", bubble: { left: horizontal, top, width, maxHeight: bubbleHeight }, arrow: { left: pointerX, top: target.top - bubbleGap } });
  }
  // With both sides free, keep the old habit of opening toward the roomier half.
  if (vertical.length) return vertical.length > 1 && centerY >= viewHeight / 2 ? vertical[1] : vertical[0];
  if (bubbleHeight <= band) {
    const top = clamp(centerY - bubbleHeight / 2, safeTop, safeBottom - bubbleHeight);
    const pointerY = clamp(centerY, top + arrowInset, top + bubbleHeight - arrowInset) - 9;
    const bubble = { top, width, maxHeight: bubbleHeight };
    if (viewWidth - bubbleGutter - (right + bubbleGap) >= width) return { side: "right", bubble: { ...bubble, left: right + bubbleGap }, arrow: { left: right + bubbleGap - 10, top: pointerY } };
    if (target.left - bubbleGap - bubbleGutter >= width) return { side: "left", bubble: { ...bubble, left: target.left - bubbleGap - width }, arrow: { left: target.left - bubbleGap, top: pointerY } };
  }
  return dock;
}

export type ScrollChoice = { delta: number; placement: Placement };
export type ScrollInput = PlacementInput & {
  /** How far the page may scroll up (negative) and down from here. */
  minDelta: number;
  maxDelta: number;
  /** The garden header's bottom edge now; it scrolls away with the garden. */
  headerBottom?: number;
};

/**
 * Chooses how far to scroll the garden (positive is down) together with the
 * placement. Keeps the current view when it already has a side for the
 * bubble with the whole flower in view; otherwise takes the smallest allowed
 * scroll that makes one fit (flower at the top of the band with the bubble
 * below, at the bottom with it above, or centered beside it). Docks only when
 * no scroll works, with the flower at the top of the band so the docked
 * bubble covers as little of it as possible.
 */
export function chooseScroll(input: ScrollInput): ScrollChoice {
  const { target, minDelta, maxDelta, headerBottom } = input;
  const flowerBottom = Math.min(input.flowerBottom ?? input.safeBottom, input.safeBottom);
  // After scrolling by `delta` the header has moved up by the same amount.
  const topAt = (delta: number) => headerBottom === undefined ? input.safeTop : Math.max(0, headerBottom - delta) + bubbleGutter;
  const at = (delta: number): ScrollChoice => ({
    delta,
    placement: placeBubble({ ...input, safeTop: topAt(delta), target: target && { ...target, top: target.top - delta } }),
  });
  const current = at(0);
  if (!target || current.placement.side !== "dock") return current;
  const allowed = (delta: number) => clamp(delta, minDelta, maxDelta);
  // Aim 1px inside each edge so sub-pixel layout still fits after scrolling.
  const inset = 1;
  // Once scrolled away, the header frees the top of the screen.
  const lowestTop = headerBottom === undefined ? input.safeTop : bubbleGutter;
  const flowerAtTop = target.top - lowestTop - inset;
  const candidates = [
    flowerAtTop,
    target.top - input.safeTop - inset,
    target.top + target.height - flowerBottom + inset,
    target.top + target.height / 2 - (lowestTop + flowerBottom) / 2,
  ].map(allowed).sort((a, b) => Math.abs(a) - Math.abs(b));
  for (const delta of candidates) {
    const choice = at(delta);
    if (choice.placement.side !== "dock") return choice;
  }
  return at(allowed(flowerAtTop));
}
