import type { FramePass, Gpu, Target, sampler } from "vgpu";
import type { Vec3 } from "@/lib/world/layout";
import type { SkyState } from "@/lib/world/solar";
import type { WorldLighting } from "@/lib/world/sky-palette";

/**
 * Values of the shared `World` uniform struct exported by
 * `shaders/common.wgsl`. Layers whose shaders import that struct can bind it
 * with `draw.set({ world: frame.world })` to share the camera, sky and light.
 */
export interface WorldUniforms {
  readonly viewProjection: Float32Array;
  readonly inverseViewProjection: Float32Array;
  /** Orthographic key-light camera of the shadow map. */
  readonly lightViewProjection: Float32Array;
  readonly eye: Vec3;
  readonly time: number;
  readonly lightDir: readonly number[];
  readonly lightIntensity: number;
  readonly lightColor: readonly number[];
  readonly night: number;
  readonly ambient: readonly number[];
  readonly stars: number;
  readonly zenith: readonly number[];
  readonly glow: number;
  readonly horizon: readonly number[];
  readonly hoveredSpot: number;
  readonly fog: readonly number[];
  readonly fogDensity: number;
  readonly sunDir: readonly number[];
  readonly aspect: number;
  readonly moonDir: readonly number[];
  readonly pixelScale: number;
  readonly camRight: Vec3;
  /** 1 while the lake's mirror image is rendered (layers are not drawn into it). */
  readonly clipWater: number;
  readonly camUp: Vec3;
  readonly waterLevel: number;
  /** A warm local light (the landing's porch lanterns and open door). */
  readonly lamp: Vec3;
  /** Strength of `lamp`; 0 turns it off. */
  readonly lampLevel: number;
}

/** Per-frame view of the world handed to every layer. */
export interface WorldFrameContext {
  readonly gpu: Gpu;
  /** Column-major view-projection matrix of the world camera. */
  readonly viewProjection: Float32Array;
  readonly eye: Vec3;
  /** Animation seconds; frozen at 0 under reduced motion. */
  readonly time: number;
  readonly reducedMotion: boolean;
  readonly lighting: WorldLighting;
  readonly sky: SkyState;
  /** Flower under the pointer, if any. */
  readonly hoveredFlowerId: string | null;
  /** The shared `World` uniform values for this frame. */
  readonly world: WorldUniforms;
}

/**
 * The key light's shadow map. Bind `map` to a `texture_depth_2d` and `sampler`
 * to a `sampler_comparison`, then call `shadowFactor` from
 * `shaders/common.wgsl` to receive shadows.
 */
export interface WorldShadow {
  readonly map: Target;
  readonly sampler: ReturnType<typeof sampler>;
}

export interface WorldLayerSetup {
  readonly gpu: Gpu;
  /**
   * The world's scene target (rgba16float, depth24plus, 4x MSAA). Compile draws
   * against it; it is resized by the world, so bind nothing from it.
   */
  readonly sceneTarget: Target;
  readonly shadow: WorldShadow;
}

/**
 * Extension point for content drawn inside the painted world, such as the
 * procedural flowers. Layers draw into the same depth-tested scene pass as the
 * terrain, after the opaque landscape and before translucent markers.
 *
 * The scene's alpha channel is a message to the painterly post-process: world
 * shaders write view distance (0..1, see `distanceAlpha` in
 * `shaders/common.wgsl`) so far paint is abstracted more. A layer that wants
 * to keep fine detail (e.g. botanical flower close-ups) writes alpha -1; its
 * pixels then keep most of their crisp rendering. HDR colour above ~1.1 blooms
 * into a soft glow/aura.
 */
export interface WorldLayer {
  /** Called once with the world's GPU context before the layer first draws. */
  setup?(context: WorldLayerSetup): void | Promise<void>;
  /** Encodes the layer's draws. Must stay synchronous. */
  draw(pass: FramePass, frame: WorldFrameContext): void;
  /** Releases layer-owned resources (also implied by the world disposing its GPU context). */
  dispose?(): void;
}
