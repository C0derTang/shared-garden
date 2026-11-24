/**
 * Procedural flowers for the painted garden: one deterministic plant per
 * (type, seed, growth). Pure — no GPU — so it is unit-tested directly.
 */

import { flowerTypes, type FlowerType } from "@/lib/garden-v2/model";
import { SPROUT_GLOW, evenGlowColor, evenGlowRadius } from "../glow";
import { PlantBuilder, growthFor, type Aura, type GrowthStage } from "./builder";
import { linear, streamFor } from "./math";
import {
  PART_FLOATS,
  packBlob,
  packSheet,
  packTube,
  placePoint,
  type BlobPart,
  type FlowerInstanceInfo,
  type Placement,
  type Rgb,
  type SheetPart,
  type TubePart,
} from "./parts";
import { SPECIES } from "./species";

export { growthFor, growthStage, type GrowthStage } from "./builder";

export interface FlowerSpec {
  readonly type: FlowerType;
  /** The flower's stable appearance seed (integer 0 .. 2^53 - 1). */
  readonly seed: number;
  /** Growth as a fraction of the type's target: 0 just planted .. 1 in bloom. */
  readonly growth: number;
  /** Hydrangea florets take these colours (sRGB hex, e.g. mood colours) when given. */
  readonly moodColors?: readonly string[];
  /** A blooming dandelion has gone to seed (a seed puff). */
  readonly puff?: boolean;
}

export interface FlowerModel {
  readonly type: FlowerType;
  readonly stage: GrowthStage;
  readonly sheets: readonly SheetPart[];
  readonly tubes: readonly TubePart[];
  readonly blobs: readonly BlobPart[];
  /** Height of the plant above its base (flower-local units). */
  readonly height: number;
  /** Horizontal reach from the stem axis. */
  readonly radius: number;
  /**
   * Soft coloured glow around the head (around the shoot for a seedling). Its
   * colour has the shared glow luminance of `lib/world/glow`, so every type
   * and stage glows alike.
   */
  readonly aura: Aura;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Builds the plant for a flower. Same spec, same plant. */
export function generateFlower(spec: FlowerSpec): FlowerModel {
  const growth = growthFor(spec.growth);
  const builder = new PlantBuilder(spec.seed, spec.type, growth);
  const moods = (spec.moodColors ?? []).filter((hex) => HEX.test(hex)).map((hex) => linear(hex));
  SPECIES[spec.type](builder, { moods, puff: spec.puff === true });
  const bounds = builder.bounds();
  const height = Math.max(bounds.height, 0.05);
  // Seedlings have no head yet: they glow softly around the shoot, like the seed mark they grew from.
  const aura: Aura = builder.aura
    ? { ...builder.aura, color: evenGlowColor(builder.aura.color) }
    : { center: [0, height * 0.7, 0], radius: Math.max(0.06, height * 0.9), color: SPROUT_GLOW };
  return {
    type: spec.type,
    stage: growth.stage,
    sheets: builder.sheets,
    tubes: builder.tubes,
    blobs: builder.blobs,
    height,
    radius: Math.max(bounds.radius, 0.03),
    aura,
  };
}

/** Every flower type, in catalogue order. */
export const FLOWER_TYPES: readonly FlowerType[] = flowerTypes;

/** A natural resting turn for a flower in the world (kept near facing the camera). */
export function flowerYaw(seed: number): number {
  return (streamFor(seed, "yaw")() - 0.5) * 1.1;
}

/** Wind phase of a flower in [0, 1). */
export function flowerPhase(seed: number): number {
  return streamFor(seed, "phase")();
}

/** A flower model placed in the world. */
export interface PlacedFlower {
  readonly model: FlowerModel;
  readonly placement: Placement;
  readonly phase: number;
}

/** Instance data for a set of placed flowers, ready for the GPU. */
export interface PackedFlowers {
  readonly sheets: Float32Array<ArrayBuffer>;
  readonly tubes: Float32Array<ArrayBuffer>;
  readonly blobs: Float32Array<ArrayBuffer>;
  readonly sheetCount: number;
  readonly tubeCount: number;
  readonly blobCount: number;
  /** Floats per aura: center xyz, radius, rgb, flower index. */
  readonly auras: Float32Array<ArrayBuffer>;
  readonly auraCount: number;
}

export const AURA_FLOATS = 8;

export interface PackOptions {
  /**
   * Keep every aura's world radius within the shared plot-glow band (the
   * world, where every plot should glow alike). The close-up hero keeps each
   * flower's own aura size.
   */
  readonly evenAuraRadius?: boolean;
}

export function packFlowers(flowers: readonly PlacedFlower[], options: PackOptions = {}): PackedFlowers {
  let sheetCount = 0;
  let tubeCount = 0;
  let blobCount = 0;
  let auraCount = 0;
  for (const f of flowers) {
    sheetCount += f.model.sheets.length;
    tubeCount += f.model.tubes.length;
    blobCount += f.model.blobs.length;
    auraCount += 1;
  }
  const sheets = new Float32Array(sheetCount * PART_FLOATS);
  const tubes = new Float32Array(tubeCount * PART_FLOATS);
  const blobs = new Float32Array(blobCount * PART_FLOATS);
  const auras = new Float32Array(auraCount * AURA_FLOATS);
  let s = 0;
  let t = 0;
  let b = 0;
  let a = 0;
  flowers.forEach((f, index) => {
    const info: FlowerInstanceInfo = {
      index,
      phase: f.phase,
      base: f.placement.position,
      height: f.model.height * f.placement.scale,
    };
    for (const part of f.model.sheets) packSheet(sheets, s++, part, f.placement, info);
    for (const part of f.model.tubes) packTube(tubes, t++, part, f.placement, info);
    for (const part of f.model.blobs) packBlob(blobs, b++, part, f.placement, info);
    const aura = f.model.aura;
    const c = placePoint(aura.center, f.placement);
    const radius = aura.radius * f.placement.scale;
    auras.set([c[0], c[1], c[2], options.evenAuraRadius ? evenGlowRadius(radius) : radius, aura.color[0], aura.color[1], aura.color[2], index], a * AURA_FLOATS);
    a += 1;
  });
  return { sheets, tubes, blobs, sheetCount, tubeCount, blobCount, auras, auraCount };
}

export type { Rgb };
