import { draw, geometry, type Draw, type FramePass, type Geometry, type Gpu, type Target } from "vgpu";
import { STROKE_ATTRIBUTES, STROKE_FLOATS, packStrokes, type Stroke } from "@/lib/world/strokes";
import type { WorldLayer, WorldUniforms } from "../world-layer";
import strokeShader from "./stroke.wgsl";

/** Vertices per stroke: four bendable segments, two triangles each. */
export const STROKE_VERTICES = 24;

/** A set of strokes uploaded once and drawn with one instanced call. */
export interface StrokeBatch {
  readonly count: number;
  setWorld(world: WorldUniforms): void;
  encode(pass: FramePass): void;
  compile(sceneTarget: Target): Promise<unknown>;
  dispose(): void;
}

/**
 * Uploads strokes (cards masked by the shared brush) for `stroke.wgsl`. Strokes
 * depth-test against the scene and alpha-test their ragged bristle edges.
 */
export function createStrokeBatch(gpu: Gpu, strokes: readonly Stroke[], label = "strokes"): StrokeBatch {
  const count = strokes.length;
  let mesh: Geometry | undefined;
  let brush: Draw | undefined;
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
    });
  }
  return {
    count,
    setWorld(world) {
      brush?.set({ world });
    },
    encode(pass) {
      if (brush) pass.draw(brush, { instances: count, vertices: STROKE_VERTICES });
    },
    compile(sceneTarget) {
      return brush ? brush.compile(sceneTarget) : Promise.resolve();
    },
    dispose() {
      brush?.dispose();
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
  let sceneTarget: Target | undefined;
  let batch: StrokeBatch | undefined;
  let dirty = true;
  return {
    async setup(context) {
      gpu = context.gpu;
      sceneTarget = context.sceneTarget;
      batch = createStrokeBatch(gpu, strokes, label);
      dirty = false;
      await batch.compile(sceneTarget);
    },
    draw(pass, frame) {
      if (dirty && gpu) {
        batch?.dispose();
        batch = createStrokeBatch(gpu, strokes, label);
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
    },
  };
}
