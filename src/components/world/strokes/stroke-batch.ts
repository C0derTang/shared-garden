import { draw, geometry, type Draw, type FramePass, type Geometry, type Gpu, type Target } from "vgpu";
import { STROKE_ATTRIBUTES, STROKE_FLOATS, packStrokes, type Stroke } from "@/lib/world/strokes";
import type { WorldLayer, WorldShadow, WorldUniforms } from "../world-layer";
import shadowShader from "./stroke-shadow.wgsl";
import strokeShader from "./stroke.wgsl";

/** Vertices per stroke: four bendable segments, two triangles each. */
export const STROKE_VERTICES = 24;

/** A set of strokes uploaded once and drawn with one instanced call. */
export interface StrokeBatch {
  readonly count: number;
  setWorld(world: WorldUniforms): void;
  encode(pass: FramePass): void;
  /** Draws the strokes into the key light's shadow map (only when created with `castShadows`). */
  encodeShadow(pass: FramePass): void;
  compile(sceneTarget: Target): Promise<unknown>;
  dispose(): void;
}

export interface StrokeBatchOptions {
  readonly label?: string;
  /** The world's shadow map, which lit strokes sample. */
  readonly shadow: WorldShadow;
  /** Also render these strokes into the shadow map. */
  readonly castShadows?: boolean;
}

/**
 * Uploads strokes (cards masked by the shared brush) for `stroke.wgsl`. Strokes
 * depth-test against the scene, alpha-test their ragged bristle edges, receive
 * the key light's shadows and can cast them.
 */
export function createStrokeBatch(gpu: Gpu, strokes: readonly Stroke[], options: StrokeBatchOptions): StrokeBatch {
  const count = strokes.length;
  const label = options.label ?? "strokes";
  let mesh: Geometry | undefined;
  let brush: Draw | undefined;
  let caster: Draw | undefined;
  if (count > 0) {
    mesh = geometry(gpu, {
      label,
      buffers: [{ data: packStrokes(strokes), stride: STROKE_FLOATS * 4, stepMode: "instance", attributes: STROKE_ATTRIBUTES }],
    });
    brush = draw(gpu, {
      shader: strokeShader,
      geometry: mesh,
      vertices: STROKE_VERTICES,
      instances: count,
      label,
      set: { shadowMap: options.shadow.map, shadowSampler: options.shadow.sampler },
    });
    if (options.castShadows) {
      caster = draw(gpu, {
        shader: shadowShader,
        geometry: mesh,
        vertices: STROKE_VERTICES,
        instances: count,
        depth: { write: true, compare: "less-equal", bias: 2, biasSlopeScale: 2 },
        label: `${label}.shadow`,
      });
    }
  }
  return {
    count,
    setWorld(world) {
      brush?.set({ world });
      caster?.set({ world });
    },
    encode(pass) {
      if (brush) pass.draw(brush, { instances: count, vertices: STROKE_VERTICES });
    },
    encodeShadow(pass) {
      if (caster) pass.draw(caster, { instances: count, vertices: STROKE_VERTICES });
    },
    compile(sceneTarget) {
      return Promise.all([brush?.compile(sceneTarget), caster?.compile(options.shadow.map)]);
    },
    dispose() {
      brush?.dispose();
      caster?.dispose();
      mesh?.destroy();
    },
  };
}

/**
 * A world layer that paints a list of strokes with the world's brush, e.g.
 * procedurally generated flowers. Call `replace()` to repaint.
 */
export function createStrokeLayer(initial: readonly Stroke[], label = "stroke-layer"): WorldLayer & { replace(strokes: readonly Stroke[]): void } {
  let strokes = initial;
  let gpu: Gpu | undefined;
  let shadow: WorldShadow | undefined;
  let batch: StrokeBatch | undefined;
  let dirty = true;
  return {
    async setup(context) {
      gpu = context.gpu;
      shadow = context.shadow;
      batch = createStrokeBatch(gpu, strokes, { label, shadow });
      dirty = false;
      await batch.compile(context.sceneTarget);
    },
    draw(pass, frame) {
      if (dirty && gpu && shadow) {
        batch?.dispose();
        batch = createStrokeBatch(gpu, strokes, { label, shadow });
        dirty = false;
      }
      batch?.setWorld(frame.world);
      batch?.encode(pass);
    },
    replace(next) {
      strokes = next;
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
