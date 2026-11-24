import type { Gpu, Target } from "vgpu";
import { packFlowers } from "@/lib/world/flowers/generate";
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
   * flowers keep drawing until it is ready, so a change never stalls a frame.
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
    createFlowerBatch(gpu!, packFlowers(placeWorldFlowers(set)), { shadow: shadow!, castShadows: true, detail: "world", label: "garden-world.flowers" });

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
    const token = ++generation;
    const set = flowers;
    let next: FlowerBatch;
    try {
      next = build(set);
    } catch (error) {
      // A lost device or bad data: keep drawing the previous flowers.
      console.error("Garden flowers could not be rebuilt", error);
      return;
    }
    const nextIds = set.map((flower) => flower.id);
    void next
      .compile(sceneTarget)
      .catch(() => undefined)
      .then(() => {
        if (token !== generation || !gpu) next.dispose();
        else swap(next, nextIds);
      });
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
