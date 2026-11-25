import { compute, draw, geometry, storage, type Compute, type Draw, type Frame, type FramePass, type Geometry, type Gpu, type StorageBuffer, type Target } from "vgpu";
import type { FlowerModel } from "@/lib/world/flowers/generate";
import type { Placement } from "@/lib/world/flowers/parts";
import {
  DRIFT_MAX_BLOWS,
  DRIFT_MAX_SEEDS,
  DRIFT_SEED_FLOATS,
  DRIFT_SEEDS_PER_BLOW,
  DRIFT_STATE_FLOATS,
  HALO_FLOATS,
  clearPuffHalo,
  clearSeedDrift,
  packPuffHalo,
  packSeedDrift,
} from "@/lib/world/flowers/seed-drift";
import type { Vec3 } from "@/lib/world/layout";
import type { WorldShadow, WorldUniforms } from "../world-layer";
import { templateGrid, type FlowerDetail } from "./flower-batch";
import simShader from "./seed-drift-sim.wgsl";
import seedShader from "./seed-drift.wgsl";
import haloShader from "./seed-halo.wgsl";

const WORKGROUP = 64;
/** Template grid per seed part ([along, around]); the hero matches its puff's blobs. */
const GRID: Record<FlowerDetail, [number, number]> = { world: [9, 11], hero: [24, 32] };
/** A state no seed record can match (so every slot starts fresh). */
const UNSET = -1e9;
/** Drift-clock start of a held blow: its seeds stay attached until released. */
const HELD = 1e7;

export interface SeedBlow {
  /** The flower's seed puff (its `puffSeeds` blow away). */
  readonly puff: FlowerModel;
  /** The flower's appearance seed (timing and flight vary with it). */
  readonly seed: number;
  /** Where the flower stands, exactly as it is drawn. */
  readonly placement: Placement;
  /** Its wind-sway phase, exactly as it is drawn. */
  readonly phase: number;
  /** Direction the breeze blows. */
  readonly wind: Vec3;
  /** Breeze speed (world units per second). */
  readonly speed: number;
  /** Reduced motion: the puff fades in place instead. */
  readonly still: boolean;
}

export interface SeedDriftParams {
  /** Sway of attached seeds (match the flowers'). */
  readonly sway: number;
  /** Seeds within this distance keep their detail through the painterly filter. */
  readonly detailNear: number;
  /** Extra glow of drifting seeds. */
  readonly glow: number;
  /** Strength of the puff's soft glow (match the flowers' aura). */
  readonly aura: number;
}

/**
 * Dandelion seeds blowing away (#201): a compute pass simulates every seed in
 * the air; one instanced draw paints them with the puff's own parts and light,
 * translucent so they fade into the sky. Up to eight blows held or in the air at once. Shared by
 * the world's flower layer and the hero studio.
 */
export interface SeedDrift {
  /**
   * Starts a blow now and returns its slot. With `hold`, the seeds stay
   * attached, looking exactly like the puff, until `release` lets them go.
   * A held blow is never evicted: when every slot is taken (by held blows, or
   * for a held request by anything), it returns -1 and the caller retries
   * later. It also returns -1 when the model has no seeds.
   */
  blow(blow: SeedBlow, options?: { readonly hold?: boolean }): number;
  /** True while a slot is free for a new held blow. */
  readonly hasFreeSlot: boolean;
  /** Lets a held blow's seeds go now, on this breeze. */
  release(slot: number, breeze: Pick<SeedBlow, "wind" | "speed" | "still">): void;
  /** Seconds since the latest blow let go (Infinity before any). */
  readonly sinceRelease: number;
  /** Advances the drift clock and simulates the seeds in the air (compute). */
  step(frame: Frame, dt: number): void;
  setWorld(world: WorldUniforms): void;
  setParams(params: SeedDriftParams): void;
  /** The puff's dissolving glow and the seeds' colour (translucent; draw after everything opaque). */
  encode(pass: FramePass): void;
  /** Marks near, mostly opaque seed pixels to keep their detail through the painterly filter (alpha only). */
  encodeDetail(pass: FramePass): void;
  /** Ends every blow at once. */
  clear(): void;
  compile(sceneTarget: Target, detail?: boolean): Promise<unknown>;
  dispose(): void;
}

export function createSeedDrift(gpu: Gpu, shadow: WorldShadow, options: { detail: FlowerDetail; label: string }): SeedDrift {
  const label = options.label;
  const records = new Float32Array(DRIFT_MAX_SEEDS * DRIFT_SEED_FLOATS);
  const seedBuffer: StorageBuffer = storage(gpu, records.byteLength, "read");
  const stateBuffer: StorageBuffer = storage(gpu, DRIFT_MAX_SEEDS * DRIFT_STATE_FLOATS * 4, "read-write");
  seedBuffer.write(records);
  const states = new Float32Array(DRIFT_MAX_SEEDS * DRIFT_STATE_FLOATS);
  for (let i = 0; i < DRIFT_MAX_SEEDS; i += 1) states[i * DRIFT_STATE_FLOATS + 3] = UNSET;
  stateBuffer.write(states);

  const haloRecords = new Float32Array(DRIFT_MAX_BLOWS * HALO_FLOATS);
  for (let slot = 0; slot < DRIFT_MAX_BLOWS; slot += 1) clearPuffHalo(haloRecords, slot);
  const haloBuffer: StorageBuffer = storage(gpu, haloRecords.byteLength, "read");
  haloBuffer.write(haloRecords);

  const [along, around] = GRID[options.detail];
  const grid = templateGrid(along, around);
  const mesh: Geometry = geometry(gpu, { label: `${label}.grid`, buffers: [{ data: grid.vertices, attributes: { grid: "float32x2" } }], indices: grid.indices });
  const sim: Compute = compute(gpu, simShader, { label: `${label}.sim`, set: { seeds: seedBuffer, states: stateBuffer } });
  const bindings = { shadowMap: shadow.map, shadowSampler: shadow.sampler, seeds: seedBuffer, states: stateBuffer };
  const color: Draw = draw(gpu, {
    shader: seedShader,
    geometry: mesh,
    entry: { vertex: "vs_main", fragment: "fs_main" },
    // Translucent colour; the scene's alpha (the painterly filter's message) is left alone.
    blend: { color: { src: "src-alpha", dst: "one-minus-src-alpha" }, alpha: { src: "zero", dst: "one" } },
    depth: { write: false, compare: "less-equal" },
    label: `${label}.seeds`,
    set: bindings,
  });
  const halo: Draw = draw(gpu, {
    shader: haloShader,
    vertices: 6,
    blend: "additive",
    writeMask: ["r", "g", "b"],
    depth: { write: false, compare: "less-equal" },
    label: `${label}.halo`,
    set: { halos: haloBuffer },
  });
  let detail: Draw | undefined;

  /** Drift-clock seconds; advances only while the host paints. */
  let clock = 0;
  /** When each slot's blow has faded (drift clock); 0 when free. */
  const ends = new Float64Array(DRIFT_MAX_BLOWS);
  /** Slots in use, as the highest used slot + 1 (what is simulated and drawn). */
  let span = 0;
  // Reused every frame (no per-frame allocations).
  const simParams = { sim: { time: 0, dt: 0, count: 0, pad: 0 } };
  const viewParams = { drift: { sway: 0, detailNear: 0, glow: 0, pad: 0 } };
  const haloParams = { halo: { time: 0, aura: 0, pad: [0, 0] } };
  let releasedAt = -Infinity;
  /** New records the compute pass has not settled yet. */
  let dirty = false;
  const worldValue: { world: WorldUniforms | null } = { world: null };

  /** Each slot's blow (kept so a held blow can be released). */
  const blows: (SeedBlow | null)[] = Array.from({ length: DRIFT_MAX_BLOWS }, () => null);

  const pack = (slot: number, blow: SeedBlow, start: number) => {
    const first = slot * DRIFT_SEEDS_PER_BLOW;
    clearSeedDrift(records, first, DRIFT_SEEDS_PER_BLOW);
    const packed = packSeedDrift(records, first, blow.puff, { seed: blow.seed, placement: blow.placement, phase: blow.phase }, {
      start,
      wind: blow.wind,
      speed: blow.speed,
      still: blow.still,
    });
    ends[slot] = packed.end;
    packPuffHalo(haloRecords, slot, blow.puff, blow.placement, start, blow.still, options.detail === "world");
    if (start !== HELD) releasedAt = start;
    dirty = true;
    seedBuffer.write(records);
    haloBuffer.write(haloRecords);
    refreshSpan();
  };

  const refreshSpan = () => {
    span = 0;
    for (let slot = 0; slot < DRIFT_MAX_BLOWS; slot += 1) if (ends[slot]! > clock) span = slot + 1;
  };

  return {
    get sinceRelease() {
      return clock - releasedAt;
    },
    get hasFreeSlot() {
      for (let i = 0; i < DRIFT_MAX_BLOWS; i += 1) if (ends[i]! <= clock) return true;
      return false;
    },
    blow(blow, options) {
      if (blow.puff.puffSeeds.length === 0) return -1;
      const hold = options?.hold === true;
      // The first free slot; a blow that starts now may take over the released
      // blow closest to finishing. Held blows are never evicted.
      let slot = -1;
      for (let i = 0; i < DRIFT_MAX_BLOWS && slot < 0; i += 1) if (ends[i]! <= clock) slot = i;
      if (slot < 0 && !hold) {
        for (let i = 0; i < DRIFT_MAX_BLOWS; i += 1) if (ends[i] !== Infinity && (slot < 0 || ends[i]! < ends[slot]!)) slot = i;
      }
      if (slot < 0) return -1;
      blows[slot] = blow;
      pack(slot, blow, hold ? HELD : clock);
      if (hold) ends[slot] = Infinity;
      return slot;
    },
    release(slot, breeze) {
      const held = blows[slot];
      if (!held || ends[slot] !== Infinity) return;
      blows[slot] = { ...held, ...breeze };
      pack(slot, blows[slot]!, clock);
    },
    step(frame, dt) {
      clock += dt;
      if (span === 0) return;
      // Held seeds rest where the puff paints them: simulate only while seeds
      // fly, or once to settle newly written records.
      let flying = false;
      for (let slot = 0; slot < DRIFT_MAX_BLOWS; slot += 1) if (ends[slot]! > clock - dt && ends[slot] !== Infinity) flying = true;
      if (!flying && !dirty) return;
      dirty = false;
      const count = span * DRIFT_SEEDS_PER_BLOW;
      simParams.sim.time = clock;
      simParams.sim.dt = dt;
      simParams.sim.count = count;
      sim.set(simParams);
      frame.computePass({ label }, (pass) => pass.dispatch(sim, Math.ceil(count / WORKGROUP)));
      // Faded blows free their slots (their records stay until reused; the shader hides them).
      let freed = false;
      for (let slot = 0; slot < DRIFT_MAX_BLOWS; slot += 1) {
        if (ends[slot]! > 0 && ends[slot]! <= clock) {
          clearSeedDrift(records, slot * DRIFT_SEEDS_PER_BLOW, DRIFT_SEEDS_PER_BLOW);
          clearPuffHalo(haloRecords, slot);
          ends[slot] = 0;
          blows[slot] = null;
          freed = true;
        }
      }
      if (freed) {
        seedBuffer.write(records);
        haloBuffer.write(haloRecords);
        refreshSpan();
      }
    },
    setWorld(world) {
      // Nothing in the air: no uniform uploads.
      if (span === 0) return;
      worldValue.world = world;
      color.set(worldValue);
      halo.set(worldValue);
      detail?.set(worldValue);
    },
    setParams(params) {
      if (span === 0) return;
      viewParams.drift.sway = params.sway;
      viewParams.drift.detailNear = params.detailNear;
      viewParams.drift.glow = params.glow;
      color.set(viewParams);
      detail?.set(viewParams);
      haloParams.halo.time = clock;
      haloParams.halo.aura = params.aura;
      halo.set(haloParams);
    },
    encode(pass) {
      if (span === 0) return;
      pass.draw(halo, { instances: span, vertices: 6 });
      pass.draw(color, { instances: span * DRIFT_SEEDS_PER_BLOW * 3 });
    },
    encodeDetail(pass) {
      if (span > 0 && detail) pass.draw(detail, { instances: span * DRIFT_SEEDS_PER_BLOW * 3 });
    },
    clear() {
      clearSeedDrift(records, 0, DRIFT_MAX_SEEDS);
      for (let slot = 0; slot < DRIFT_MAX_BLOWS; slot += 1) clearPuffHalo(haloRecords, slot);
      haloBuffer.write(haloRecords);
      ends.fill(0);
      blows.fill(null);
      dirty = false;
      span = 0;
      seedBuffer.write(records);
    },
    compile(sceneTarget, withDetail = false) {
      if (withDetail && !detail) {
        detail = draw(gpu, {
          shader: seedShader,
          geometry: mesh,
          entry: { vertex: "vs_main", fragment: "fs_detail" },
          writeMask: ["a"],
          depth: { write: false, compare: "less-equal" },
          label: `${label}.seeds-detail`,
          set: bindings,
        });
      }
      return Promise.all([sim.compile(), color.compile(sceneTarget), halo.compile(sceneTarget), detail?.compile(sceneTarget)]);
    },
    dispose() {
      sim.dispose();
      color.dispose();
      halo.dispose();
      detail?.dispose();
      mesh.destroy();
      // Storage buffers have no destroy in vgpu's public API; they go with the GPU context (as the fireworks' do).
    },
  };
}
