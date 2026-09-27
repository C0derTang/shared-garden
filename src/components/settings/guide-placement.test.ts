import { expect, it } from "vitest";
import { placeBubble } from "./guide-placement";

const phone = { viewWidth: 390, viewHeight: 844, safeTop: 74, safeBottom: 740 };
const flower = (left: number, top: number) => ({ left, top, width: 88, height: 130 });
const fits = (p: ReturnType<typeof placeBubble>, height: number, band: { safeTop: number; safeBottom: number }) =>
  p.bubble.top >= band.safeTop && p.bubble.top + height <= band.safeBottom && p.bubble.maxHeight >= height;
const overlaps = (p: ReturnType<typeof placeBubble>, height: number, t: ReturnType<typeof flower>) =>
  p.bubble.left < t.left + t.width && p.bubble.left + p.bubble.width > t.left && p.bubble.top < t.top + t.height && p.bubble.top + height > t.top;

it("opens below a high flower and above a low one when the whole bubble fits", () => {
  const high = placeBubble({ ...phone, target: flower(20, 80), bubbleHeight: 250 });
  expect(high.side).toBe("below");
  expect(fits(high, 250, phone)).toBe(true);
  const low = placeBubble({ ...phone, target: flower(150, 560), bubbleHeight: 250 });
  expect(low.side).toBe("above");
  expect(fits(low, 250, phone)).toBe(true);
});

it("falls back beside the flower on a short landscape screen instead of squeezing the bubble", () => {
  const landscape = { viewWidth: 844, viewHeight: 390, safeTop: 74, safeBottom: 290 };
  const target = flower(110, 90);
  const placed = placeBubble({ ...landscape, target, bubbleHeight: 200 });
  expect(placed.side).toBe("right");
  expect(fits(placed, 200, landscape)).toBe(true);
  expect(overlaps(placed, 200, target)).toBe(false);
  expect(placed.arrow!.left).toBe(target.left + target.width + 14 - 10);
  const onRight = placeBubble({ ...landscape, target: flower(640, 90), bubbleHeight: 200 });
  expect(onRight.side).toBe("left");
  expect(onRight.bubble.left + onRight.bubble.width).toBeLessThanOrEqual(640 - 14);
});

it("docks inside the safe band, clear of the header and hotbar, when no side fits", () => {
  const small = { viewWidth: 320, viewHeight: 568, safeTop: 74, safeBottom: 464 };
  const docked = placeBubble({ ...small, target: flower(116, 170), bubbleHeight: 260 });
  expect(docked.side).toBe("dock");
  expect(docked.arrow).toBeUndefined();
  expect(fits(docked, 260, small)).toBe(true);
  // Enlarged text taller than the band scrolls inside the bubble, still in the band.
  const huge = placeBubble({ ...small, target: null, bubbleHeight: 900 });
  expect(huge.bubble.top).toBe(74);
  expect(huge.bubble.maxHeight).toBe(390);
});
