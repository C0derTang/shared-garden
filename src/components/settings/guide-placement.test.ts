import { describe, expect, it } from "vitest";
import { chooseScroll, placeBubble } from "./guide-placement";

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

describe("scroll-aware choice", () => {
  const short = { viewWidth: 390, viewHeight: 664, safeTop: 74, safeBottom: 560, bubbleHeight: 257 };
  it("keeps the current view when a side already fits with the whole flower in view", () => {
    const choice = chooseScroll({ ...short, target: flower(150, 90), minDelta: -300, maxDelta: 900 });
    expect(choice.delta).toBe(0);
    expect(choice.placement.side).toBe("below");
  });

  it("scrolls a centered mid-garden flower so the bubble fits above or below instead of docking over it", () => {
    const target = flower(150, 252);
    expect(placeBubble({ ...short, target }).side).toBe("dock");
    const choice = chooseScroll({ ...short, target, minDelta: -600, maxDelta: 900 });
    expect(choice.delta).not.toBe(0);
    expect(["below", "above"]).toContain(choice.placement.side);
    const moved = { ...target, top: target.top - choice.delta };
    expect(moved.top).toBeGreaterThanOrEqual(short.safeTop);
    expect(moved.top + moved.height).toBeLessThanOrEqual(short.safeBottom);
    expect(overlaps(choice.placement, 257, moved)).toBe(false);
  });

  it("treats a flower under the hotbar or Today card as not fitting, and scrolls it up", () => {
    const target = flower(150, 480);
    expect(placeBubble({ ...short, target }).side).toBe("dock");
    const choice = chooseScroll({ ...short, target, minDelta: -600, maxDelta: 900 });
    expect(choice.placement.side).toBe("above");
    expect(target.top + target.height - choice.delta).toBeLessThanOrEqual(short.safeBottom);
  });

  it("docks only when no scroll position works, with the flower at the top of the band", () => {
    const tiny = { ...short, safeBottom: 330 };
    const choice = chooseScroll({ ...tiny, target: flower(150, 252), minDelta: -600, maxDelta: 900 });
    expect(choice.placement.side).toBe("dock");
    expect(252 - choice.delta).toBeCloseTo(tiny.safeTop + 1);
    // At the end of the page the scroll is clamped to what is available.
    const clamped = chooseScroll({ ...short, target: flower(150, 252), minDelta: 0, maxDelta: 40 });
    expect(Math.abs(clamped.delta)).toBeLessThanOrEqual(40);
  });
});

describe("scroll-aware choice with the scrolling header and the Today card", () => {
  it("counts the room a scrolled-away header frees, instead of scrolling to the end and docking", () => {
    // 390x664 with the header still showing (bottom at 68): scrolling the
    // flower up also scrolls the header away, which makes room above.
    const view = { viewWidth: 390, viewHeight: 664, safeTop: 80, safeBottom: 561, flowerBottom: 478, headerBottom: 68, bubbleHeight: 257 };
    const choice = chooseScroll({ ...view, target: flower(150, 452), minDelta: 0, maxDelta: 331 });
    expect(["above", "below"]).toContain(choice.placement.side);
    expect(choice.delta).toBeLessThan(331);
    const moved = { ...flower(150, 452 - choice.delta) };
    expect(moved.top + moved.height).toBeLessThanOrEqual(view.flowerBottom);
    expect(overlaps(choice.placement, 257, moved)).toBe(false);
  });

  it("lets the bubble cover the dimmed Today card but never lets the flower sit under it", () => {
    const landscape = { viewWidth: 844, viewHeight: 390, safeTop: 12, safeBottom: 285, flowerBottom: 202, bubbleHeight: 201 };
    const under = flower(110, 120);
    expect(placeBubble({ ...landscape, target: under }).side).toBe("dock");
    const choice = chooseScroll({ ...landscape, target: under, minDelta: -200, maxDelta: 400 });
    expect(choice.placement.side).toBe("right");
    expect(120 + 130 - choice.delta).toBeLessThanOrEqual(landscape.flowerBottom);
    expect(choice.placement.bubble.top + 201).toBeLessThanOrEqual(landscape.safeBottom);
  });
});
