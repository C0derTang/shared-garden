import type { Gpu, Target } from "vgpu";
import { flowerPhase, flowerYaw, packFlowers, type FlowerModel, type FlowerSpec } from "@/lib/world/flowers/generate";
import { SEE_NEAR, headOnScreen } from "@/lib/world/flowers/seeing";
import { PLOT_GLOW, plotGlowLevel } from "@/lib/world/glow";
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
export { SEE_NEAR, headOnScreen } from "@/lib/world/flowers/seeing";

/** A bloomed dandelion showing its golden head (its seeds have flown), not its puff. */
export function showsGoldenHead(spec: FlowerSpec): boolean {
  return spec.type === "dandelion" && quantisedGrowth(spec.growth) >= 1 && spec.puff !== true;
}


interface SeedRequest {
  readonly id: string;
  readonly onStart?: () => void;
  /**
   * Held drift slot (seeds attached, looking exactly like the puff), or -1
   * while none is free; until then the flower batch keeps painting its puff.
   */
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
   * Blows a dandelion's seeds away (#201) the first painted moment it is in
   * view and near (`SEE_NEAR`), with no hold on (`holdSeeds`, `deferSeeds`).
   * Until then it always looks like its puff: the batch keeps painting the
   * puff until a drift slot is free, then its seeds are held in the drift
   * (identical) and the golden head is swapped in beneath them. It never
   * shows its golden head before the blow. `onStart` runs as they let go.
   * A second request for the same flower while one waits is ignored.
   */
  blowSeeds(id: string, options?: { readonly onStart?: () => void }): void;
  /** Holds back this flower's waiting blow (e.g. while the camera glides to open its painting); null lets it go. */
  deferSeeds(id: string | null): void;
  /** Holds every waiting blow (e.g. until the arrival from the house has settled). */
  holdSeeds(hold: boolean): void;
  /** Blows asked for that have not started yet. */
  readonly waitingSeeds: number;
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
  /** Waiting blows, in request order (an array, so the per-frame scan allocates nothing). */
  const seedRequests: SeedRequest[] = [];
  const driftParams = { sway: 0, detailNear: DETAIL_NEAR, glow: SEED_GLOW, aura: 0 };
  /** The last painted camera (pending blows start only once their flower is in view). */
  const lastView = new Float32Array(16);
  let viewKnown = false;
  const camRight: [number, number, number] = [1, 0, 0];
  const eye: [number, number, number] = [0, 0, 0];
  let deferred: string | null = null;
  let holdAll = false;
  let generation = 0;
  /** The rebuild whose batch is compiling, or 0. */
  let compiling = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let worldWritten: WorldUniforms | undefined;

  const build = (set: readonly WorldFlower[]) =>
    createFlowerBatch(gpu!, packFlowers(placeWorldFlowers(set), { evenAuraRadius: true }), { shadow: shadow!, castShadows: true, detail: "world", label: "garden-world.flowers" });

  const waitingUnheld = (id: string) => {
    for (const request of seedRequests) if (request.id === id && request.slot < 0) return true;
    return false;
  };

  /** The flowers as drawn: a waiting dandelion whose seeds are not held yet keeps its puff. */
  const asDrawn = (set: readonly WorldFlower[]): readonly WorldFlower[] => {
    if (seedRequests.length === 0) return set;
    let out: WorldFlower[] | null = null;
    set.forEach((flower, index) => {
      if (!showsGoldenHead(flower.spec) || !waitingUnheld(flower.id)) return;
      out ??= [...set];
      out[index] = { ...flower, spec: { ...flower.spec, puff: true } };
    });
    return out ?? set;
  };

  const swap = (next: FlowerBatch, set: readonly WorldFlower[]) => {
    batch?.dispose();
    batch = next;
    ids = set.map((flower) => flower.id);
    drawnFlowers = set;
    worldWritten = undefined;
  };

  /** The flower with this id in a set, without allocating. */
  const findFlower = (set: readonly WorldFlower[], id: string) => {
    for (let i = 0; i < set.length; i += 1) if (set[i]!.id === id) return set[i];
    return undefined;
  };

  const blowFor = (flower: WorldFlower, puff: FlowerModel, reducedMotion: boolean, hold: boolean) =>
    drift!.blow(
      {
        puff,
        seed: flower.spec.seed,
        placement: { position: flower.position, yaw: flowerYaw(flower.spec.seed), scale: 1 },
        phase: flowerPhase(flower.spec.seed),
        // Across the view and away, so the seeds drift over the scene.
        wind: [camRight[0], 0, camRight[2] - 0.35],
        speed: SEED_BREEZE,
        still: reducedMotion,
      },
      { hold },
    );

  /** The bed the navigator frames (settled), as of the last painted frame. */
  let framed: { readonly center: Vec3; readonly radius: number } | null = null;
  const near = (head: Vec3) =>
    viewKnown &&
    headOnScreen(lastView, head) &&
    (Math.hypot(head[0] - eye[0], head[1] - eye[1], head[2] - eye[2]) <= SEE_NEAR ||
      (framed !== null && Math.hypot(head[0] - framed.center[0], head[2] - framed.center[2]) <= framed.radius));

  /** Holds, then releases, requested seed blows (before the frame's compute and draws). */
  const advanceSeeds = (reducedMotion: boolean) => {
    if (!drift) return;
    // In request order, so the earliest waiting puffs are held first.
    for (let i = 0; i < seedRequests.length; i += 1) {
      const request = seedRequests[i]!;
      const id = request.id;
      // Only bloomed dandelions have seeds to blow; anything else is dropped, not scanned forever.
      const latest = findFlower(flowers, id);
      if (!latest || latest.spec.type !== "dandelion" || quantisedGrowth(latest.spec.growth) < 1) {
        seedRequests.splice(i--, 1);
        continue;
      }
      const drawn = findFlower(drawnFlowers, id);
      if (!drawn) continue;
      if (request.slot < 0) {
        if (!drift.hasFreeSlot) {
          // Every slot is busy (holding other puffs, or seeds still flying): the
          // batch keeps painting its puff. (Restore it if it was ever drawn golden.)
          if (showsGoldenHead(drawn.spec)) redraw();
          continue;
        }
        // The wish has not reached the drawn data yet: the batch paints the real puff.
        if (!showsGoldenHead(latest.spec)) continue;
        const puff = flowerModel({ ...latest.spec, puff: true });
        request.slot = blowFor(latest, puff, reducedMotion, true);
        if (request.slot < 0) continue;
        request.head = [latest.position[0], latest.position[1] + puff.height, latest.position[2]];
      }
      if (!showsGoldenHead(drawn.spec)) {
        // The held seeds paint exactly over the batch's puff: swap the golden head in beneath them.
        if (showsGoldenHead(latest.spec)) redraw();
        continue;
      }
      // Held back, or not seen yet.
      if (holdAll || id === deferred || !near(request.head!)) continue;
      drift.release(request.slot, { wind: [camRight[0], 0, camRight[2] - 0.35], speed: SEED_BREEZE, still: reducedMotion });
      seedRequests.splice(i--, 1);
      if (request.onStart) queueMicrotask(request.onStart);
    }
  };

  /** Builds the current flowers (in a task, never inside a frame) and swaps them in once compiled. */
  const rebuild = () => {
    scheduled = undefined;
    if (!gpu || !shadow || !sceneTarget) return;
    const set = asDrawn(flowers);
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
    compiling = token;
    void next.compile(sceneTarget).then(
      () => {
        if (compiling === token) compiling = 0;
        if (token !== generation || !gpu) next.dispose();
        else swap(next, set);
      },
      (error: unknown) => {
        if (compiling === token) compiling = 0;
        // Never swap in flowers whose pipelines failed to compile.
        console.error("Garden flowers could not be compiled", error);
        next.dispose();
      },
    );
  };

  const schedule = () => {
    if (scheduled === undefined) scheduled = setTimeout(rebuild, 0);
  };

  /** A rebuild for a waiting dandelion's look, unless one is already on its way (it will see the change). */
  const redraw = () => {
    if (compiling === 0) schedule();
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
      const latest = flowers;
      const set = asDrawn(latest);
      const first = build(set);
      // The seeds belong to this GPU context, not to whichever flower batch
      // wins: a rebuild that supersedes this first batch must not lose them.
      const device = context.gpu;
      const seeds = createSeedDrift(device, context.shadow, { detail: "world", label: "garden-world.seeds" });
      const seedsReady = seeds.compile(context.sceneTarget, true).then(
        () => {
          if (gpu === device && !drift) drift = seeds;
          else seeds.dispose();
        },
        (error: unknown) => {
          console.error("Dandelion seeds could not be compiled", error);
          seeds.dispose();
        },
      );
      await Promise.all([first.compile(context.sceneTarget), seedsReady]);
      if (token !== generation || !gpu) first.dispose();
      else {
        swap(first, set);
        if (flowers !== latest) schedule();
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
      // Every flower shares the empty seed marks' glow rule (lib/world/glow.ts).
      batch.setParams({
        hovered: frame.hoveredFlowerId === null ? -1 : ids.indexOf(frame.hoveredFlowerId),
        selected: frame.selectedFlowerId === null ? -1 : ids.indexOf(frame.selectedFlowerId),
        sway: frame.reducedMotion ? 0 : 1,
        detailNear: DETAIL_NEAR,
        aura: plotGlowLevel(frame.lighting),
        boost: PLOT_GLOW.hoverBoost,
        grow: PLOT_GLOW.hoverGrow,
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
      framed = frame.framedBed ?? null;
      viewKnown = true;
      if (drift) {
        drift.setWorld(frame.world);
        driftParams.sway = frame.reducedMotion ? 0 : 1;
        // The held puff's halo shares the flowers' glow level.
        driftParams.aura = plotGlowLevel(frame.lighting);
        drift.setParams(driftParams);
        drift.encode(pass);
        drift.encodeDetail(pass);
      }
    },
    get waitingSeeds() {
      return seedRequests.length;
    },
    blowSeeds(id, options) {
      for (const request of seedRequests) if (request.id === id) return;
      seedRequests.push({ id, onStart: options?.onStart, slot: -1, head: null });
    },
    deferSeeds(id) {
      deferred = id;
    },
    holdSeeds(hold) {
      holdAll = hold;
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
      framed = null;
      // Requests survive a device-loss restart; their held seeds do not.
      for (const request of seedRequests) request.slot = -1;
      gpu = undefined;
      shadow = undefined;
      sceneTarget = undefined;
      worldWritten = undefined;
    },
  };
}
