import type { Gpu } from "vgpu";
import { packFlowers } from "@/lib/world/flowers/generate";
import type { WorldLayer, WorldShadow } from "../world-layer";
import { createFlowerBatch, type FlowerBatch } from "./flower-batch";
import { placeWorldFlowers, type WorldFlower } from "./flower-models";

export { flowerModel, placeWorldFlowers, worldFlowerAnchors, type WorldFlower } from "./flower-models";

/** Flowers keep their botanical detail through the painterly filter within this distance. */
const DETAIL_NEAR = 14;

export interface FlowerLayer extends WorldLayer {
  /** Replaces the flowers; GPU buffers are rebuilt on the next frame. */
  setFlowers(flowers: readonly WorldFlower[]): void;
}

/** World layer that paints the procedural flowers (instanced), casts their shadows and glows. */
export function createFlowerLayer(initial: readonly WorldFlower[] = []): FlowerLayer {
  let flowers = initial;
  let gpu: Gpu | undefined;
  let shadow: WorldShadow | undefined;
  let batch: FlowerBatch | undefined;
  let dirty = true;
  let ids: string[] = [];

  const rebuild = () => {
    if (!gpu || !shadow) return;
    batch?.dispose();
    batch = createFlowerBatch(gpu, packFlowers(placeWorldFlowers(flowers)), { shadow, castShadows: true, detail: "world", label: "garden-world.flowers" });
    ids = flowers.map((flower) => flower.id);
    dirty = false;
  };

  return {
    async setup(context) {
      gpu = context.gpu;
      shadow = context.shadow;
      rebuild();
      await batch?.compile(context.sceneTarget);
    },
    drawShadow(pass, frame) {
      if (dirty) rebuild();
      if (!batch) return;
      batch.setWorld(frame.world);
      batch.setParams({ hovered: -1, sway: frame.reducedMotion ? 0 : 1, detailNear: DETAIL_NEAR, aura: 0 });
      batch.encodeShadow(pass);
    },
    draw(pass, frame) {
      if (dirty) rebuild();
      if (!batch) return;
      // Strongest in the golden hour; a gentle halo at night so the dark stays dark.
      const aura = 0.16 * (0.3 + 0.7 * frame.lighting.glow) + 0.05 * frame.lighting.night;
      batch.setWorld(frame.world);
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
      flowers = next;
      dirty = true;
    },
    dispose() {
      batch?.dispose();
      batch = undefined;
      gpu = undefined;
      shadow = undefined;
      dirty = true;
    },
  };
}
