import type { Gpu, Target } from "vgpu";
import { packFlowers } from "@/lib/world/flowers/generate";
import { PLOT_GLOW, plotGlowLevel } from "@/lib/world/glow";
import type { WorldLayer, WorldShadow, WorldUniforms } from "../world-layer";
import { createFlowerBatch, type FlowerBatch } from "./flower-batch";
import { placeWorldFlowers, type WorldFlower } from "./flower-models";

export { flowerModel, placeWorldFlowers, worldFlowerAnchors, type WorldFlower } from "./flower-models";

/** Flowers keep their botanical detail through the painterly filter within this distance. */
const DETAIL_NEAR = 14;

export interface FlowerLayer extends WorldLayer {
  /**
   * Replaces the flowers. The new set is generated, packed, uploaded and its
   * pipelines compiled in a task outside the frame callbacks; the previous
   * flowers keep drawing until it is ready.
   */
  setFlowers(flowers: readonly WorldFlower[]): void;
}

/** World layer that paints the procedural flowers (instanced), casts their shadows and glows. */
export function createFlowerLayer(initial: readonly WorldFlower[] = []): FlowerLayer {
  let flowers = initial;
  let gpu: Gpu | undefined;
  let shadow: WorldShadow | undefined;
  let sceneTarget: Target | undefined;
  let batch: FlowerBatch | undefined;
  let ids: string[] = [];
  let generation = 0;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let worldWritten: WorldUniforms | undefined;

  const build = (set: readonly WorldFlower[]) =>
    createFlowerBatch(gpu!, packFlowers(placeWorldFlowers(set), { evenAuraRadius: true }), { shadow: shadow!, castShadows: true, detail: "world", label: "garden-world.flowers" });

  const swap = (next: FlowerBatch, nextIds: string[]) => {
    batch?.dispose();
    batch = next;
    ids = nextIds;
    worldWritten = undefined;
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
    const nextIds = set.map((flower) => flower.id);
    void next.compile(sceneTarget).then(
      () => {
        if (token !== generation || !gpu) next.dispose();
        else swap(next, nextIds);
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
      await first.compile(context.sceneTarget);
      if (token !== generation || !gpu) first.dispose();
      else {
        swap(first, set.map((flower) => flower.id));
        if (flowers !== set) schedule();
      }
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
      gpu = undefined;
      shadow = undefined;
      sceneTarget = undefined;
      worldWritten = undefined;
    },
  };
}
