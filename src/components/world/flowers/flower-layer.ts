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
   * Replaces the flowers. The new set is built and its pipelines compiled in
   * the background; the previous flowers keep drawing until it is ready, so a
   * change never stalls a frame.
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
  let stale = true;
  let worldWritten: WorldUniforms | undefined;

  const build = (set: readonly WorldFlower[]) =>
    createFlowerBatch(gpu!, packFlowers(placeWorldFlowers(set)), { shadow: shadow!, castShadows: true, detail: "world", label: "garden-world.flowers" });

  const swap = (next: FlowerBatch, nextIds: string[]) => {
    batch?.dispose();
    batch = next;
    ids = nextIds;
    worldWritten = undefined;
  };

  /** Builds the current flowers off the frame path and swaps them in once compiled. */
  const rebuild = () => {
    if (!gpu || !shadow || !sceneTarget) return;
    stale = false;
    const token = ++generation;
    const set = flowers;
    const next = build(set);
    const nextIds = set.map((flower) => flower.id);
    void next
      .compile(sceneTarget)
      .catch(() => undefined)
      .then(() => {
        if (token !== generation || !gpu) next.dispose();
        else swap(next, nextIds);
      });
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
        stale = flowers !== set;
      }
    },
    drawShadow(pass, frame) {
      if (stale) rebuild();
      if (!batch) return;
      writeWorld(frame.world);
      batch.setShadowParams({ hovered: -1, sway: frame.reducedMotion ? 0 : 1, detailNear: DETAIL_NEAR, aura: 0 });
      batch.encodeShadow(pass);
    },
    draw(pass, frame) {
      if (stale) rebuild();
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
      stale = true;
    },
    dispose() {
      generation += 1;
      batch?.dispose();
      batch = undefined;
      gpu = undefined;
      shadow = undefined;
      sceneTarget = undefined;
      worldWritten = undefined;
      stale = true;
    },
  };
}
