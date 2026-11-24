import { draw, geometry, type Draw, type FramePass, type Geometry, type Gpu, type Target } from "vgpu";
import { AURA_FLOATS, type PackedFlowers } from "@/lib/world/flowers/generate";
import { PART_ATTRIBUTES, PART_FLOATS } from "@/lib/world/flowers/parts";
import type { WorldShadow, WorldUniforms } from "../world-layer";
import auraShader from "./aura.wgsl";
import shadowShader from "./flower-shadow.wgsl";
import flowerShader from "./flower.wgsl";

/** Template grid resolution: `world` for many small flowers, `hero` for one close-up. */
export type FlowerDetail = "world" | "hero";

const RESOLUTION: Record<FlowerDetail, { sheet: [number, number]; tube: [number, number]; blob: [number, number] }> = {
  // [along, across] vertices
  world: { sheet: [13, 7], tube: [9, 7], blob: [9, 11] },
  hero: { sheet: [52, 27], tube: [28, 16], blob: [24, 32] },
};

export interface FlowerParamsValue {
  /** Index of the hovered flower, or -1. */
  readonly hovered: number;
  /** Wind sway amount (0 for none). */
  readonly sway: number;
  /** World units within which flowers keep their botanical detail through the painterly filter. */
  readonly detailNear: number;
  /** Strength of the coloured aura. */
  readonly aura: number;
  /** Index of the selected flower (lit like the hovered one), or -1. Defaults to -1. */
  readonly selected?: number;
  /** How much the hovered or selected flower's aura brightens (default 1). */
  readonly boost?: number;
  /** How much its aura widens (default 1). */
  readonly grow?: number;
}

function paramsValue(params: FlowerParamsValue) {
  return {
    hovered: params.hovered,
    sway: params.sway,
    detailNear: params.detailNear,
    aura: params.aura,
    selected: params.selected ?? -1,
    boost: params.boost ?? 1,
    grow: params.grow ?? 1,
  };
}

/** A grid of (u, w) in [0, 1]² with triangle indices. */
export function templateGrid(along: number, across: number): { vertices: Float32Array<ArrayBuffer>; indices: Uint32Array<ArrayBuffer> } {
  const vertices = new Float32Array(along * across * 2);
  for (let i = 0; i < along; i += 1) {
    for (let j = 0; j < across; j += 1) {
      const o = (i * across + j) * 2;
      vertices[o] = i / (along - 1);
      vertices[o + 1] = j / (across - 1);
    }
  }
  const indices = new Uint32Array((along - 1) * (across - 1) * 6);
  let k = 0;
  for (let i = 0; i < along - 1; i += 1) {
    for (let j = 0; j < across - 1; j += 1) {
      const a = i * across + j;
      const b = a + 1;
      const c = a + across;
      const d = c + 1;
      indices.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { vertices, indices };
}

interface PartDraws {
  readonly mesh: Geometry;
  readonly lit: Draw;
  readonly caster?: Draw;
  readonly count: number;
}

/** Every flower of a layer (or the studio), drawn with three instanced templates plus auras. */
export interface FlowerBatch {
  /** Shared camera and light for every draw of the batch (once per frame). */
  setWorld(world: WorldUniforms): void;
  /** Parameters of the lit petals and the auras. */
  setParams(params: FlowerParamsValue): void;
  /** Parameters of the shadow casters (only when created with `castShadows`). */
  setShadowParams(params: FlowerParamsValue): void;
  /** Petals, leaves, stalks and seed heads. */
  encode(pass: FramePass): void;
  /** The additive auras; draw after everything opaque. */
  encodeAura(pass: FramePass): void;
  /** Into the key light's shadow map (only when created with `castShadows`). */
  encodeShadow(pass: FramePass): void;
  compile(sceneTarget: Target): Promise<unknown>;
  dispose(): void;
}

export interface FlowerBatchOptions {
  readonly shadow: WorldShadow;
  readonly castShadows?: boolean;
  readonly detail?: FlowerDetail;
  readonly label?: string;
}

const ENTRIES = { sheet: "vs_sheet", tube: "vs_tube", blob: "vs_blob" } as const;

export function createFlowerBatch(gpu: Gpu, packed: PackedFlowers, options: FlowerBatchOptions): FlowerBatch {
  const label = options.label ?? "flowers";
  const resolution = RESOLUTION[options.detail ?? "world"];
  const parts: PartDraws[] = [];
  const make = (key: keyof typeof ENTRIES, data: Float32Array<ArrayBuffer>, count: number) => {
    if (count === 0) return;
    const [along, across] = resolution[key];
    const grid = templateGrid(along, across);
    const mesh = geometry(gpu, {
      label: `${label}.${key}`,
      buffers: [
        { data: grid.vertices, attributes: { grid: "float32x2" } },
        { data, stride: PART_FLOATS * 4, stepMode: "instance", attributes: PART_ATTRIBUTES },
      ],
      indices: grid.indices,
    });
    const lit = draw(gpu, {
      shader: flowerShader,
      geometry: mesh,
      instances: count,
      entry: { vertex: ENTRIES[key], fragment: "fs_main" },
      label: `${label}.${key}`,
      set: { shadowMap: options.shadow.map, shadowSampler: options.shadow.sampler },
    });
    const caster = options.castShadows
      ? draw(gpu, {
          shader: shadowShader,
          geometry: mesh,
          instances: count,
          entry: { vertex: ENTRIES[key], fragment: "fs_shadow" },
          depth: { write: true, compare: "less-equal", bias: 2, biasSlopeScale: 2 },
          label: `${label}.${key}.shadow`,
        })
      : undefined;
    parts.push({ mesh, lit, caster, count });
  };
  make("sheet", packed.sheets, packed.sheetCount);
  make("tube", packed.tubes, packed.tubeCount);
  make("blob", packed.blobs, packed.blobCount);

  let auraMesh: Geometry | undefined;
  let aura: Draw | undefined;
  if (packed.auraCount > 0) {
    auraMesh = geometry(gpu, {
      label: `${label}.aura`,
      buffers: [{ data: packed.auras, stride: AURA_FLOATS * 4, stepMode: "instance", attributes: { sphere: "float32x4", paint: "float32x4" } }],
    });
    aura = draw(gpu, {
      shader: auraShader,
      geometry: auraMesh,
      vertices: 6,
      instances: packed.auraCount,
      blend: "additive",
      writeMask: ["r", "g", "b"],
      depth: { write: false, compare: "less-equal" },
      label: `${label}.aura`,
    });
  }

  return {
    setWorld(world) {
      for (const part of parts) {
        part.lit.set({ world });
        part.caster?.set({ world });
      }
      aura?.set({ world });
    },
    setParams(params) {
      const value = paramsValue(params);
      for (const part of parts) part.lit.set({ flowers: value });
      aura?.set({ flowers: value });
    },
    setShadowParams(params) {
      const value = paramsValue(params);
      for (const part of parts) part.caster?.set({ flowers: value });
    },
    encode(pass) {
      for (const part of parts) pass.draw(part.lit, { instances: part.count });
    },
    encodeAura(pass) {
      if (aura) pass.draw(aura, { instances: packed.auraCount, vertices: 6 });
    },
    encodeShadow(pass) {
      for (const part of parts) if (part.caster) pass.draw(part.caster, { instances: part.count });
    },
    compile(sceneTarget) {
      return Promise.all([
        ...parts.map((part) => part.lit.compile(sceneTarget)),
        ...parts.flatMap((part) => (part.caster ? [part.caster.compile(options.shadow.map)] : [])),
        aura?.compile(sceneTarget),
      ]);
    },
    dispose() {
      for (const part of parts) {
        part.lit.dispose();
        part.caster?.dispose();
        part.mesh.destroy();
      }
      parts.length = 0;
      aura?.dispose();
      auraMesh?.destroy();
    },
  };
}
