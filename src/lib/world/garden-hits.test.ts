/**
 * Automated hit tests for the garden's plots (#206): a seeded garden of every
 * type and stage, seen through the real garden camera at 1280×800 and
 * 390×844 (overview, among the beds, and the plot navigator's framing of each
 * bed), picked with the same function the world uses for the pointer.
 */
import { describe, expect, it } from "vitest";
import { worldFlowerAnchors, type WorldFlower } from "@/components/world/flowers/flower-models";
import { FLOWER_TYPES } from "./flowers/generate";
import { gardenFovY, gardenPose, gardenViewProjection, type GardenCameraState } from "./garden-camera";
import { plotPose } from "./journey";
import { bedAt, layoutPlantingSpots, spotPosition } from "./layout";
import { MIN_TARGET_PX, pickOnScreen, plotFootprints, spineDistance, type ScreenView } from "./picking";

/** Twenty flowers on spots 1–20 (bed 1 full, bed 2 two-thirds): every type, every stage. */
const GROWTH = [1, 0, 0.2, 0.4, 0.6, 1, 0, 0.4, 0.8, 0.2, 1, 0.6, 0, 0.2, 1, 0.6, 1, 0.1, 0.4, 0.2];
const garden: WorldFlower[] = GROWTH.map((growth, i) => ({
  id: `flower-${i + 1}`,
  spec: { type: FLOWER_TYPES[i % FLOWER_TYPES.length]!, seed: (i + 1) * 104_729 + 7, growth },
  position: spotPosition(i + 1).position,
}));
const anchors = worldFlowerAnchors(garden);
const empty = layoutPlantingSpots(24)
  .filter((spot) => spot.spot > garden.length)
  .map((spot) => ({ spot: spot.spot, position: spot.position }));
/** Seedlings: below a quarter of their growth. */
const sprouts = anchors.filter((_, i) => GROWTH[i]! < 0.25);

const SIZES = [
  [1280, 800],
  [390, 844],
] as const;

function views(width: number, height: number): { name: string; view: ScreenView }[] {
  const aspect = width / height;
  const fovY = gardenFovY(aspect);
  const at = (state: GardenCameraState): ScreenView => ({ viewProjection: gardenViewProjection(width, height, gardenPose(state, aspect, fovY)), width, height });
  const list = [
    { name: "overview", view: at({ journey: 0, pan: 0 }) },
    { name: "among the beds", view: at({ journey: 1, pan: 0 }) },
    { name: "among the beds, walked left", view: at({ journey: 1, pan: -3.3 }) },
  ];
  for (const bed of [0, 1]) {
    const framed = plotPose({ position: bedAt(bed).center, height: 0, bedCenter: bedAt(bed).center }, aspect, fovY);
    list.push({ name: `navigator framing bed ${bed + 1}`, view: at({ journey: 0, pan: 0, browse: framed, browseWeight: 1 }) });
  }
  return list;
}

function onScreen(view: ScreenView, x: number, y: number) {
  return x >= 0 && y >= 0 && x <= view.width && y <= view.height;
}

/** Where a flower's middle lands on screen. */
function centreOf(view: ScreenView, id: string) {
  return plotFootprints(view, [], anchors).find((f) => f.target.kind === "flower" && f.target.id === id)?.centre ?? null;
}

/** Probes on a ring of `radius` px around (x, y). */
function ring(x: number, y: number, radius: number, count = 16) {
  return Array.from({ length: count }, (_, k) => [x + Math.cos((k * 2 * Math.PI) / count) * radius, y + Math.sin((k * 2 * Math.PI) / count) * radius] as const);
}

describe.each(SIZES)("garden plots at %i×%i", (width, height) => {
  const all = views(width, height).map((entry) => [entry.name, entry.view] as const);

  it.each(all)("selects every sprout when tapped on it (%s)", (_name, view) => {
    let checked = 0;
    for (const sprout of sprouts) {
      const centre = centreOf(view, sprout.id);
      if (!centre || !onScreen(view, centre[0], centre[1])) continue;
      checked += 1;
      expect(pickOnScreen(view, centre[0], centre[1], empty, anchors), sprout.id).toMatchObject({ kind: "flower", id: sprout.id });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(all)("never misses within half the minimum target of any plot (%s)", (_name, view) => {
    for (const footprint of plotFootprints(view, empty, anchors)) {
      const [x, y] = footprint.centre;
      if (!onScreen(view, x, y)) continue;
      for (const [px, py] of ring(x, y, MIN_TARGET_PX / 2 - 1)) expect(pickOnScreen(view, px, py, empty, anchors)).not.toBeNull();
    }
  });

  it.each(all)("gives every sprout a 44 px target, shared only with plots nearer the pointer (%s)", (_name, view) => {
    const footprints = plotFootprints(view, empty, anchors);
    const of = (target: string | number) => footprints.find((f) => (f.target.kind === "flower" ? f.target.id : f.target.spot) === target)!;
    for (const sprout of sprouts) {
      const centre = centreOf(view, sprout.id);
      if (!centre || !onScreen(view, centre[0], centre[1])) continue;
      const mine = of(sprout.id);
      // Alone within 48 px, a sprout owns its whole 44 px target.
      const alone = footprints.every((f) => f === mine || spineDistance(f, centre[0], centre[1]) >= MIN_TARGET_PX);
      for (const radius of [8, 14, 22]) {
        for (const [x, y] of ring(centre[0], centre[1], radius)) {
          const picked = pickOnScreen(view, x, y, empty, anchors);
          expect(picked).not.toBeNull();
          if (picked!.kind === "flower" && picked!.id === sprout.id) continue;
          expect(alone, `${sprout.id} owns its target`).toBe(false);
          // Only a plot whose spine is at least as near the pointer takes it.
          const other = of(picked!.kind === "flower" ? picked!.id : picked!.kind === "spot" ? picked!.spot : -1);
          expect(spineDistance(other, x, y)).toBeLessThanOrEqual(spineDistance(mine, x, y) + 0.25);
        }
      }
    }
  });

  it("gives a lone sprout a whole 44 px target even from the far overview", () => {
    const aspect = width / height;
    const view: ScreenView = { viewProjection: gardenViewProjection(width, height, gardenPose({ journey: 0, pan: 0 }, aspect, gardenFovY(aspect))), width, height };
    const lone = worldFlowerAnchors([{ id: "sprout", spec: { type: "rose", seed: 7, growth: 0 }, position: spotPosition(1).position }]);
    const [footprint] = plotFootprints(view, [], lone);
    const [x, y] = footprint!.centre;
    // The sprout itself is only a few pixels across here.
    expect(Math.hypot(footprint!.parts[0]!.b[0] - footprint!.parts[0]!.a[0], footprint!.parts[0]!.b[1] - footprint!.parts[0]!.a[1])).toBeLessThan(20);
    for (const radius of [4, 12, 20, MIN_TARGET_PX / 2 - 1]) {
      for (const [px, py] of ring(x, y, radius)) expect(pickOnScreen(view, px, py, [], lone)).toMatchObject({ kind: "flower", id: "sprout" });
    }
    for (const [px, py] of ring(x, y, MIN_TARGET_PX / 2 + 12)) expect(pickOnScreen(view, px, py, [], lone)).toBeNull();
  });

  it("frames a whole bed of plots in the navigator view, clear of the navigator", () => {
    const aspect = width / height;
    const fovY = gardenFovY(aspect);
    for (const bed of [0, 1]) {
      const framed = plotPose({ position: bedAt(bed).center, height: 0, bedCenter: bedAt(bed).center }, aspect, fovY);
      const view: ScreenView = { viewProjection: gardenViewProjection(width, height, gardenPose({ journey: 0, pan: 0, browse: framed, browseWeight: 1 }, aspect, fovY)), width, height };
      for (let k = 0; k < 12; k += 1) {
        const spot = spotPosition(bed * 12 + k + 1).position;
        const [footprint] = plotFootprints(view, [{ spot: 0, position: spot }], []);
        expect(footprint, `spot ${k + 1} of bed ${bed + 1} in front of the camera`).toBeDefined();
        const [x, y] = footprint!.centre;
        expect(x).toBeGreaterThan(24);
        expect(y).toBeGreaterThan(24);
        // Landscape: the navigator floats at the right; portrait: at the bottom.
        if (aspect >= 1) expect(x).toBeLessThan(width - 300);
        else expect(y).toBeLessThan(height - 170);
      }
    }
  });
});
