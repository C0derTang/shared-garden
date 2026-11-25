/** CPU side of the world flowers: cached plant models, placement and pick targets (no GPU). */

import { flowerPhase, flowerYaw, generateFlower, type FlowerModel, type FlowerSpec, type PlacedFlower } from "@/lib/world/flowers/generate";
import type { Vec3 } from "@/lib/world/layout";
import type { FlowerAnchor } from "@/lib/world/picking";

/** A procedural flower standing in the painted world. */
export interface WorldFlower {
  readonly id: string;
  readonly spec: FlowerSpec;
  /** Base of the stem (usually a planting spot's position). */
  readonly position: Vec3;
}

const modelCache = new Map<string, FlowerModel>();

/**
 * Growth is quantised to 1/1000 so near-identical fractions share one model.
 * It rounds down, so a fraction just below a stage threshold (25%, 50%, 100%)
 * never jumps into the next stage; the tiny epsilon keeps exact thresholds
 * (e.g. 1/4 or 2/4) from falling below themselves through float error.
 */
export function quantisedGrowth(growth: number): number {
  return Number.isFinite(growth) ? Math.floor(Math.min(1, Math.max(0, growth)) * 1000 + 1e-6) / 1000 : 0;
}

function modelKey(spec: FlowerSpec): string {
  return [spec.type, spec.seed, quantisedGrowth(spec.growth), spec.puff ? 1 : 0, (spec.moodColors ?? []).join(",")].join("|");
}

/** The (cached) plant for a spec; models are immutable. */
export function flowerModel(spec: FlowerSpec): FlowerModel {
  const key = modelKey(spec);
  let model = modelCache.get(key);
  if (!model) {
    if (modelCache.size > 600) modelCache.clear();
    model = generateFlower({ ...spec, growth: quantisedGrowth(spec.growth) });
    modelCache.set(key, model);
  }
  return model;
}

/** Places world flowers with their natural resting turn and wind phase. */
export function placeWorldFlowers(flowers: readonly WorldFlower[]): PlacedFlower[] {
  return flowers.map((flower) => ({
    model: flowerModel(flower.spec),
    placement: { position: flower.position, yaw: flowerYaw(flower.spec.seed), scale: 1 },
    phase: flowerPhase(flower.spec.seed),
  }));
}

/**
 * Pick targets matching each flower's real size: a sprout's body is as small
 * as the sprout (its on-screen target never is: see `MIN_TARGET_PX`), so a
 * bloom's broad leaves never swallow the sprout beside it.
 */
export function worldFlowerAnchors(flowers: readonly WorldFlower[]): FlowerAnchor[] {
  return flowers.map((flower) => {
    const model = flowerModel(flower.spec);
    return { id: flower.id, position: flower.position, height: model.height + 0.03, radius: Math.min(0.45, Math.max(0.04, model.radius * 0.9)) };
  });
}
