import type { Gpu, Target } from "vgpu";
import { flowerPhase, flowerYaw, packFlowers, type FlowerSpec } from "@/lib/world/flowers/generate";
import type { Vec3 } from "@/lib/world/layout";
import type { WorldLayer, WorldShadow, WorldUniforms } from "../world-layer";
import { createFlowerBatch, type FlowerBatch } from "./flower-batch";
import { flowerModel, placeWorldFlowers, quantisedGrowth, type WorldFlower } from "./flower-models";
import { createSeedDrift, type SeedDrift } from "./seed-drift";

export { flowerModel, placeWorldFlowers, worldFlowerAnchors, type WorldFlower } from "./flower-models";

/** Flowers keep their botanical detail through the painterly filter within this distance. */
const DETAIL_NEAR = 14;
/** Breeze that carries a dandelion's seeds in the world (world units per second). */
const SEED_BREEZE = 0.26;
/** Glow of seeds drifting in the world. */
const SEED_GLOW = 0.55;
/**
 * A dandelion is "seen" within this camera distance (world units), where its
 * floating name appears too; from the overview its seeds wait, still a puff.
 */
export const SEE_NEAR = 6.4;

/** A bloomed dandelion showing its golden head (its seeds have flown), not its puff. */
export function showsGoldenHead(spec: FlowerSpec): boolean {
  return spec.type === "dandelion" && quantisedGrowth(spec.growth) >= 1 && spec.puff !== true;
}

/** True when a flower head projects inside the view (a little inside its edges). Allocation-free. */
export function headOnScreen(m: Float32Array, head: Vec3, margin = 0.9): boolean {
  const [x, y, z] = head;
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (w <= 1e-6) return false;
  const nx = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const ny = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  const nz = (m[2]! * x + m[6]! * y + m[10]! * z + m[14]!) / w;
  return Math.abs(nx) <= margin && Math.abs(ny) <= margin && nz < 1;
}

interface SeedRequest {
  readonly onStart?: () => void;
  /** Held drift slot (seeds attached, looking like the puff), or -1 before it is drawn golden. */
  slot: number;
  /** Where its seed head is, once held. */
  head: Vec3 | null;
}

export interface FlowerLayer extends WorldLayer {
  /**
   * Replaces the flowers. The new set is generated, packed, uploaded and its
   * pipelines compiled in a task outside the frame callbacks; the previous
   * flowers keep drawing until it is ready.
   */
  setFlowers(flowers: readonly WorldFlower[]): void;
  /**
   * Blows a dandelion's seeds away (#201) the first painted moment it is drawn
   * with its golden head, in view and near (`SEE_NEAR`). Until then, once
   * golden, its seeds stay attached exactly as the puff painted them.
   * `onStart` runs as they let go.
   * A second request for the same flower while one waits is ignored.
   */
  blowSeeds(id: string, options?: { readonly onStart?: () => void }): void;
  /** Holds back this flower's waiting blow (e.g. while the camera glides to open its painting); null lets it go. */
  deferSeeds(id: string | null): void;
}

/** World layer that paints the procedural flowers (instanced), casts their shadows and glows. */
export function createFlowerLayer(initial: readonly WorldFlower[] = []): FlowerLayer {
  let flowers = initial;
  let gpu: Gpu | undefined;
  let shadow: WorldShadow | undefined;
  let sceneTarget: Target | undefined;
  let batch: FlowerBatch | undefined;
  let ids: string[] = [];
  /** The flowers the current batch draws. */
  let drawnFlowers: readonly WorldFlower[] = [];
  let drift: SeedDrift | undefined;
  const seedRequests = new Map<string, SeedRequest>();
  /** The last painted camera (pending blows start only once their flower is in view). */
  const lastView = new Float32Array(16);
  let viewKnown = false;
  const camRight: [number, number, number] = [1, 0, 0];
  const eye: [number, number, number] = [0, 0, 0];
  let deferred: string | null = null;
  let generation = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let worldWritten: WorldUniforms | undefined;

  const build = (set: readonly WorldFlower[]) =>
    createFlowerBatch(gpu!, packFlowers(placeWorldFlowers(set)), { shadow: shadow!, castShadows: true, detail: "world", label: "garden-world.flowers" });

  const swap = (next: FlowerBatch, set: readonly WorldFlower[]) => {
    batch?.dispose();
    batch = next;
    ids = set.map((flower) => flower.id);
    drawnFlowers = set;
    worldWritten = undefined;
  };

  /** Holds, then releases, requested seed blows (before the frame's compute and draws). */
  const advanceSeeds = (reducedMotion: boolean) => {
    if (!drift || seedRequests.size === 0) return;
    for (const [id, request] of seedRequests) {
      if (request.slot < 0) {
        let flower: WorldFlower | undefined;
        for (const candidate of drawnFlowers) if (candidate.id === id) flower = candidate;
        // Not drawn (yet) with its golden head: the batch still paints its puff.
        if (!flower || !showsGoldenHead(flower.spec)) continue;
        const puff = flowerModel({ ...flower.spec, puff: true });
        request.slot = drift.blow(
          {
            puff,
            seed: flower.spec.seed,
            placement: { position: flower.position, yaw: flowerYaw(flower.spec.seed), scale: 1 },
            phase: flowerPhase(flower.spec.seed),
            wind: camRight,
            speed: SEED_BREEZE,
            still: reducedMotion,
          },
          { hold: true },
        );
        if (request.slot < 0) {
          seedRequests.delete(id);
          continue;
        }
        request.head = [flower.position[0], flower.position[1] + puff.height, flower.position[2]];
      }
      const head = request.head;
      if (!head || id === deferred || !viewKnown || !headOnScreen(lastView, head)) continue;
      if (Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]) > SEE_NEAR) continue;
      // Across the view and away, so the seeds drift over the scene.
      drift.release(request.slot, { wind: [camRight[0], 0, camRight[2] - 0.35], speed: SEED_BREEZE, still: reducedMotion });
      seedRequests.delete(id);
      if (request.onStart) queueMicrotask(request.onStart);
    }
  };

  /** Builds the current flowers (in a task, never inside a frame) and swaps them in once compiled. */
  const rebuild = () => {
    scheduled = undefined;
    if (!gpu || !shadow || !sceneTarget) return;
    const set = flowers;
    let next: FlowerBatch;
    try {
      next = build(set);
    } catch (error) {
      // A lost device or bad data: keep drawing the previous flowers. A
      // failed build does not supersede a rebuild already compiling.
      console.error("Garden flowers could not be rebuilt", error);
      return;
    }
    const token = ++generation;
    void next.compile(sceneTarget).then(
      () => {
        if (token !== generation || !gpu) next.dispose();
        else swap(next, set);
      },
      (error: unknown) => {
        // Never swap in flowers whose pipelines failed to compile.
        console.error("Garden flowers could not be compiled", error);
        next.dispose();
      },
    );
  };

  const schedule = () => {
    if (scheduled === undefined) scheduled = setTimeout(rebuild, 0);
  };

  /** The shared camera and light are written once per frame, not per pass. */
  const writeWorld = (world: WorldUniforms) => {
    if (!batch || worldWritten === world) return;
    batch.setWorld(world);
    worldWritten = world;
  };

  return {
    async setup(context) {
      gpu = context.gpu;
      shadow = context.shadow;
      sceneTarget = context.sceneTarget;
      const token = ++generation;
      const set = flowers;
      const first = build(set);
      const seeds = createSeedDrift(context.gpu, context.shadow, { detail: "world", label: "garden-world.seeds" });
      await Promise.all([first.compile(context.sceneTarget), seeds.compile(context.sceneTarget, true)]);
      if (token !== generation || !gpu) {
        first.dispose();
        seeds.dispose();
      } else {
        drift = seeds;
        swap(first, set);
        if (flowers !== set) schedule();
      }
    },
    update(frame, step) {
      advanceSeeds(step.reducedMotion);
      drift?.step(frame, step.dt);
      return null;
    },
    drawShadow(pass, frame) {
      if (!batch) return;
      writeWorld(frame.world);
      batch.setShadowParams({ hovered: -1, sway: frame.reducedMotion ? 0 : 1, detailNear: DETAIL_NEAR, aura: 0 });
      batch.encodeShadow(pass);
    },
    draw(pass, frame) {
      if (!batch) return;
      writeWorld(frame.world);
      // Strongest in the golden hour; a gentle halo at night so the dark stays dark.
      const aura = 0.16 * (0.3 + 0.7 * frame.lighting.glow) + 0.05 * frame.lighting.night;
      batch.setParams({
        hovered: frame.hoveredFlowerId === null ? -1 : ids.indexOf(frame.hoveredFlowerId),
        sway: frame.reducedMotion ? 0 : 1,
        detailNear: DETAIL_NEAR,
        aura,
      });
      batch.encode(pass);
      batch.encodeAura(pass);
      lastView.set(frame.viewProjection);
      camRight[0] = frame.world.camRight[0];
      camRight[1] = frame.world.camRight[1];
      camRight[2] = frame.world.camRight[2];
      eye[0] = frame.eye[0];
      eye[1] = frame.eye[1];
      eye[2] = frame.eye[2];
      viewKnown = true;
      if (drift) {
        drift.setWorld(frame.world);
        drift.setParams({ sway: frame.reducedMotion ? 0 : 1, detailNear: DETAIL_NEAR, glow: SEED_GLOW, aura });
        drift.encode(pass);
        drift.encodeDetail(pass);
      }
    },
    blowSeeds(id, options) {
      if (!seedRequests.has(id)) seedRequests.set(id, { onStart: options?.onStart, slot: -1, head: null });
    },
    deferSeeds(id) {
      deferred = id;
    },
    setFlowers(next) {
      if (next === flowers) return;
      flowers = next;
      // Before setup, setup builds the latest set itself.
      if (gpu) schedule();
    },
    dispose() {
      generation += 1;
      if (scheduled !== undefined) clearTimeout(scheduled);
      scheduled = undefined;
      batch?.dispose();
      batch = undefined;
      drift?.dispose();
      drift = undefined;
      drawnFlowers = [];
      viewKnown = false;
      // Requests survive a device-loss restart; their held seeds do not.
      for (const request of seedRequests.values()) {
        request.slot = -1;
        request.head = null;
      }
      gpu = undefined;
      shadow = undefined;
      sceneTarget = undefined;
      worldWritten = undefined;
    },
  };
}
