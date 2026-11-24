/**
 * A dandelion's seeds blowing away when its wish comes true (#201): the
 * seed puff's own seeds (the same achene, beak and pappus parts the puff
 * paints) are released one after another, downwind first, then tumble and
 * rise on the breeze and fade into the sky. Pure: this packs the records a
 * compute pass simulates (`src/components/world/flowers/seed-drift*.wgsl`).
 */

import type { Vec3 } from "../layout";
import type { PuffSeed } from "./builder";
import type { FlowerModel } from "./generate";
import { clamp, dot, lerp, normalize, streamFor, sub } from "./math";
import { placePoint, type Placement } from "./parts";

/** Floats per seed record (sixteen vec4s; must match `DriftSeed` in seed-drift-common.wgsl). */
export const DRIFT_SEED_FLOATS = 64;
/** Floats per simulated seed state (four vec4s; must match `DriftState`). */
export const DRIFT_STATE_FLOATS = 16;
/** Seeds one blow can hold (a puff has 70 to 95). */
export const DRIFT_SEEDS_PER_BLOW = 100;
/** Blows that can be in the air at once (e.g. two wishes coming true together). */
export const DRIFT_MAX_BLOWS = 4;
export const DRIFT_MAX_SEEDS = DRIFT_SEEDS_PER_BLOW * DRIFT_MAX_BLOWS;

/** Seconds over which the seeds let go, downwind side first. */
export const DRIFT_RELEASE = 1.1;
/** Each seed's flight, from letting go until it has faded (seconds). */
export const DRIFT_LIFE: readonly [number, number] = [3.2, 4.5];
/** Fraction of a seed's flight after which it starts to fade into the sky. */
export const DRIFT_FADE_FROM = 0.42;
/** Reduced motion: the puff simply fades away over the golden head (seconds). */
export const STILL_FADE = 0.9;

/** Record modes (`v5.w`). */
export const DRIFT_MODE = { off: 0, drift: 1, still: 2 } as const;

export interface SeedDriftOptions {
  /** Drift-clock seconds when the blow begins. */
  readonly start: number;
  /** Direction the breeze blows (any length; it is normalised, usually across the view). */
  readonly wind: Vec3;
  /** Breeze speed (world units per second). */
  readonly speed: number;
  /** Reduced motion: no drift, the seeds fade where they are. */
  readonly still: boolean;
}

/** When one seed lets go and how long it flies. */
export interface SeedTiming {
  /** Seconds after the blow begins. */
  readonly release: number;
  /** Seconds from letting go until it has faded away. */
  readonly life: number;
}

/**
 * Release and flight of each seed: the side facing downwind goes first (the
 * breeze peels the puff open), with a little natural scatter. Deterministic
 * per flower seed. Under reduced motion every seed fades together.
 */
export function seedTimings(seeds: readonly PuffSeed[], flowerSeed: number, wind: Vec3, still: boolean): SeedTiming[] {
  if (still) return seeds.map(() => ({ release: 0, life: STILL_FADE }));
  const random = streamFor(flowerSeed, "dandelion:drift-timing");
  const w = normalize(wind);
  return seeds.map((seed) => {
    const downwind = (1 - dot(seed.axis, w)) / 2;
    const release = clamp(DRIFT_RELEASE * (0.72 * downwind + 0.28 * random()), 0, DRIFT_RELEASE);
    return { release, life: lerp(DRIFT_LIFE[0], DRIFT_LIFE[1], random()) };
  });
}

/** Seconds from the start of a blow until its last seed has faded. */
export function blowDuration(timings: readonly SeedTiming[]): number {
  return timings.reduce((end, t) => Math.max(end, t.release + t.life), 0);
}

const turn = (d: Vec3, place: Placement): Vec3 => {
  const p = placePoint(d, { position: [0, 0, 0], yaw: place.yaw, scale: 1 });
  return normalize(p);
};

function put(out: Float32Array, o: number, a: number, b: number, c: number, d: number) {
  out[o] = a;
  out[o + 1] = b;
  out[o + 2] = c;
  out[o + 3] = d;
}

/**
 * Packs a seed puff's seeds as drift records into `out` from seed slot
 * `first` (at most `DRIFT_SEEDS_PER_BLOW`), placed like the drawn flower so
 * that at the start every seed sits exactly where the puff painted it.
 * Returns the number of seeds and when the last one has faded (drift clock).
 */
export function packSeedDrift(
  out: Float32Array,
  first: number,
  puff: FlowerModel,
  flower: { readonly seed: number; readonly placement: Placement; readonly phase: number },
  options: SeedDriftOptions,
): { count: number; end: number } {
  const seeds = puff.puffSeeds.slice(0, DRIFT_SEEDS_PER_BLOW);
  const place = flower.placement;
  const k = place.scale;
  const wind = normalize(options.wind);
  const timings = seedTimings(seeds, flower.seed, wind, options.still);
  const random = streamFor(flower.seed, "dandelion:drift");
  const speed = options.speed;
  const mode = options.still ? DRIFT_MODE.still : DRIFT_MODE.drift;
  seeds.forEach((seed, i) => {
    const o = (first + i) * DRIFT_SEED_FLOATS;
    const timing = timings[i]!;
    const pivot = placePoint(seed.pappus.center, place);
    const axis = turn(seed.axis, place);
    const front = turn(seed.pappus.front, place);
    // Offsets of the achene and the beak's foot along the seed's axis (local units).
    const along = (p: Vec3) => dot(sub(p, seed.pappus.center), seed.axis) * k;
    const { achene, beak, pappus } = seed;
    // Each seed rides the breeze a little differently.
    const jitter = (lo: number, hi: number) => lerp(lo, hi, random());
    put(out, o, pivot[0], pivot[1], pivot[2], options.start + timing.release);
    put(out, o + 4, axis[0], axis[1], axis[2], timing.life);
    put(out, o + 8, front[0], front[1], front[2], jitter(0.28, 0.55));
    const gust = speed * jitter(0.8, 1.2);
    put(out, o + 12, wind[0] * gust, wind[1] * gust, wind[2] * gust, speed * jitter(0.45, 0.85));
    put(out, o + 16, place.position[0], place.position[1], place.position[2], puff.height * k);
    put(out, o + 20, flower.phase, jitter(-2.4, 2.4), jitter(0.4, 1), mode);
    put(out, o + 24, achene.radii[0] * k, achene.radii[1] * k, achene.radii[2] * k, along(achene.center));
    put(out, o + 28, achene.base[0], achene.base[1], achene.base[2], achene.seed);
    put(out, o + 32, achene.tip[0], achene.tip[1], achene.tip[2], along(beak.p0));
    put(out, o + 36, beak.r0 * k, beak.r1 * k, beak.seed, pappus.seed);
    put(out, o + 40, beak.base[0], beak.base[1], beak.base[2], pappus.translucency);
    put(out, o + 44, beak.tip[0], beak.tip[1], beak.tip[2], pappus.glow);
    put(out, o + 48, pappus.radii[0] * k, pappus.radii[1] * k, pappus.radii[2] * k, speed * jitter(0.25, 0.5));
    put(out, o + 52, pappus.base[0], pappus.base[1], pappus.base[2], random());
    put(out, o + 56, pappus.tip[0], pappus.tip[1], pappus.tip[2], achene.translucency);
    put(out, o + 60, jitter(0.35, 0.6), k, 0, 0);
  });
  return { count: seeds.length, end: options.start + blowDuration(timings) };
}

/** Marks seed slots `first .. first + count - 1` unused. */
export function clearSeedDrift(out: Float32Array, first: number, count: number) {
  for (let i = first; i < first + count; i += 1) out[i * DRIFT_SEED_FLOATS + 23] = DRIFT_MODE.off;
}

/** Floats per puff halo (three vec4s; must match `PuffHalo` in seed-halo.wgsl). */
export const HALO_FLOATS = 12;
/** Seconds over which the puff's soft white glow dissolves as its seeds go. */
export const HALO_FADE = 2.2;

/**
 * The seed puff's own soft glow for blow `slot`: it stays while the seeds are
 * held and dissolves as they drift (the golden head's glow takes over).
 */
export function packPuffHalo(out: Float32Array, slot: number, puff: FlowerModel, placement: Placement, start: number, still: boolean) {
  const o = slot * HALO_FLOATS;
  const aura = puff.aura;
  if (!aura) {
    clearPuffHalo(out, slot);
    return;
  }
  const center = placePoint(aura.center, placement);
  put(out, o, center[0], center[1], center[2], aura.radius * placement.scale);
  put(out, o + 4, aura.color[0], aura.color[1], aura.color[2], start);
  put(out, o + 8, still ? STILL_FADE : HALO_FADE, 0, 0, 0);
}

export function clearPuffHalo(out: Float32Array, slot: number) {
  out.fill(0, slot * HALO_FLOATS, (slot + 1) * HALO_FLOATS);
  // Long finished: no glow.
  out[slot * HALO_FLOATS + 7] = -1e9;
  out[slot * HALO_FLOATS + 8] = 1e-3;
}
