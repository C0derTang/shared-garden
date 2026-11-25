import { clock, draw, effect, frameLoop, init, sampler, surface, target, type FrameLoopHandle, type Gpu, type Target } from "vgpu";
import { lookAt, multiply, orthographic, perspective } from "@/lib/world/camera";
import { packFlowers, type FlowerModel, type PlacedFlower } from "@/lib/world/flowers/generate";
import type { Vec3 } from "@/lib/world/layout";
import { worldLightingFor } from "@/lib/world/sky-palette";
import { skyStateAt } from "@/lib/world/solar";
import blurShader from "../post/blur.wgsl";
import brightShader from "../post/bright.wgsl";
import { maxDprFor, watchDeviceLoss } from "../device-loss";
import type { WorldShadow, WorldUniforms } from "../world-layer";
import { createFlowerBatch, type FlowerBatch } from "./flower-batch";
import { createSeedDrift } from "./seed-drift";
import backdropShader from "./studio-backdrop.wgsl";
import compositeShader from "./studio-composite.wgsl";

/** How the studio looks at its flowers. */
export type StudioCamera =
  /** Hero: one flower, perspective, slowly circling it. */
  | { readonly kind: "orbit"; readonly target: Vec3; readonly distance: number; readonly elevation: number; readonly fovY: number; readonly spin: number }
  /** Gallery: a flat, orthographic plate of many flowers. */
  | { readonly kind: "plate"; readonly center: Vec3; readonly halfHeight: number; readonly elevation: number };

export interface StudioState {
  readonly flowers: readonly PlacedFlower[];
  readonly camera: StudioCamera;
  /** Sky time that sets the light's colour; null follows the live clock. */
  readonly time: Date | null;
  readonly reducedMotion: boolean;
  /** Aura strength. */
  readonly aura: number;
  /** Wind sway amount. */
  readonly sway: number;
  /**
   * The ground behind the flower: a deep botanical plate (default), or a
   * darkened, painted impression of the garden's sky and meadow for the time
   * of day ("sky").
   */
  readonly backdrop?: "plate" | "sky";
  /**
   * A dandelion's seeds blowing away (#201): each new `token` blows the seeds
   * of `puff` (the first flower's seed puff) once the first flower is drawn
   * with its golden head.
   */
  readonly seeds?: { readonly token: number; readonly puff: FlowerModel; readonly seed: number } | null;
}

export interface StudioView {
  readonly viewProjection: Float32Array;
  readonly width: number;
  readonly height: number;
}

export interface StudioCallbacks {
  onReady(): void;
  onUnsupported(error: unknown): void;
  onError(error: unknown): void;
  onLost(info: GPUDeviceLostInfo): void;
  onFrame?(view: StudioView): void;
}

export interface StudioRenderer {
  update(state: StudioState): void;
  dispose(): void;
}

const HDR: GPUTextureFormat = "rgba16float";
const RENDER_BUDGET = 1_900_000;
const SHADOW_SIZE = 2048;
/** Breeze that carries a blown dandelion's seeds across the hero (flower units per second). */
const SEED_BREEZE = 0.1;
/** Glow of the hero's drifting seeds. */
const SEED_GLOW = 0.45;
/** Seconds over which a blown dandelion's golden glow kindles (reduced motion: with the puff's fade). */
const KINDLE = 2.4;
const STILL_KINDLE = 0.9;

const smoothstep01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Centre and radius of everything the studio shows. */
function sceneBounds(flowers: readonly PlacedFlower[]): { center: Vec3; radius: number } {
  if (flowers.length === 0) return { center: [0, 0.3, 0], radius: 1 };
  let min: Vec3 = [Infinity, Infinity, Infinity];
  let max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const f of flowers) {
    const p = f.placement.position;
    const r = f.model.radius * f.placement.scale;
    const h = f.model.height * f.placement.scale;
    min = [Math.min(min[0], p[0] - r), Math.min(min[1], p[1]), Math.min(min[2], p[2] - r)];
    max = [Math.max(max[0], p[0] + r), Math.max(max[1], p[1] + h), Math.max(max[2], p[2] + r)];
  }
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  return { center, radius: Math.max(0.2, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2) };
}

/**
 * Renders procedural flowers on their own, lit like a botanical plate: the
 * hero close-up and the development gallery. Requires WebGPU.
 */
export function createStudioRenderer(canvas: HTMLCanvasElement, initial: StudioState, callbacks: StudioCallbacks): StudioRenderer {
  let state = initial;
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: (() => void)[] = [];

  const fail = (error: unknown) => {
    if (disposed) return;
    dispose();
    callbacks.onError(error);
  };

  const start = async () => {
    let nextGpu: Gpu;
    try {
      nextGpu = await init();
    } catch (error) {
      if (!disposed) {
        dispose();
        callbacks.onUnsupported(error);
      }
      return;
    }
    if (disposed) {
      nextGpu.dispose();
      return;
    }
    gpu = nextGpu;
    watchDeviceLoss(nextGpu, () => disposed, (info) => {
      dispose();
      callbacks.onLost(info);
    });
    const largestSide = Math.max(canvas.clientWidth, canvas.clientHeight, 1);
    const dprCap = maxDprFor(largestSide, nextGpu.gpu.limits.maxTextureDimension2D);
    const output = surface(gpu, canvas, { dpr: [Math.min(1, dprCap), dprCap], label: "flower-studio" });
    const renderScale = () => Math.min(1, Math.sqrt(RENDER_BUDGET / Math.max(1, output.size[0] * output.size[1])));
    const full = (): [number, number] => {
      const k = renderScale();
      return [Math.max(1, Math.round(output.size[0] * k)), Math.max(1, Math.round(output.size[1] * k))];
    };
    // The glow runs at quarter resolution so it spreads wide and soft, like the plates' halo.
    const half = (): [number, number] => {
      const [w, h] = full();
      return [Math.max(1, Math.floor(w / 4)), Math.max(1, Math.floor(h / 4))];
    };
    const scene: Target = target(gpu, { size: full(), format: HDR, depth: true, msaa: true, label: "flower-studio.scene" });
    const glowA: Target = target(gpu, { size: half(), format: HDR, label: "flower-studio.glow-a" });
    const glowB: Target = target(gpu, { size: half(), format: HDR, label: "flower-studio.glow-b" });
    const shadowMap: Target = target(gpu, { size: [SHADOW_SIZE, SHADOW_SIZE], format: "r8unorm", depth: "depth32float", label: "flower-studio.shadow" });
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const shadowSampler = sampler(gpu, { compare: "less-equal", minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const shadow: WorldShadow = { map: shadowMap, sampler: shadowSampler };

    const backdrop = draw(gpu, { shader: backdropShader, vertices: 3, depth: false, label: "flower-studio.backdrop" });
    const bright = effect(gpu, brightShader, { label: "flower-studio.bright" });
    const blurH = effect(gpu, blurShader, { label: "flower-studio.blur-h" });
    const blurV = effect(gpu, blurShader, { label: "flower-studio.blur-v" });
    const composite = effect(gpu, compositeShader, { label: "flower-studio.composite" });

    const bind = () => {
      const [w, h] = scene.size;
      const [hw, hh] = glowA.size;
      bright.set({ source: scene, sourceSampler: linear, params: { texel: [1 / w, 1 / h], threshold: 0.32, knee: 0.35 } });
      blurH.set({ source: glowA, sourceSampler: linear, params: { direction: [2.2 / hw, 0], pad: [0, 0] } });
      blurV.set({ source: glowB, sourceSampler: linear, params: { direction: [0, 2.2 / hh], pad: [0, 0] } });
      composite.set({ scene, glow: glowA, linearSampler: linear, params: { resolution: [output.size[0], output.size[1]], exposure: 0.9, glowStrength: 0.8 } });
    };
    bind();
    cleanups.push(
      output.onResize(() => {
        if (disposed) return;
        scene.resize(full());
        glowA.resize(half());
        glowB.resize(half());
        bind();
      }),
    );

    let batch: FlowerBatch | undefined;
    let batchFlowers: readonly PlacedFlower[] | undefined;
    let bounds = sceneBounds(state.flowers);
    const rebuild = () => {
      batchFlowers = state.flowers;
      bounds = sceneBounds(state.flowers);
      batch?.dispose();
      batch = createFlowerBatch(gpu!, packFlowers(state.flowers), { shadow, castShadows: true, detail: "hero", label: "flower-studio.flowers" });
    };
    rebuild();
    const drift = createSeedDrift(gpu, shadow, { detail: "hero", label: "flower-studio.seeds" });
    cleanups.push(() => drift.dispose());
    let blownToken: number | null = null;
    // Reused every frame.
    const driftParams = { sway: 0, detailNear: 1e6, glow: 0, aura: 0 };

    await Promise.all([
      batch?.compile(scene),
      drift.compile(scene),
      backdrop.compile(scene),
      bright.compile(glowA),
      blurH.compile(glowB),
      blurV.compile(glowA),
      composite.compile(output),
    ]);
    if (disposed) return;

    const view = new Float32Array(16);
    const projection = new Float32Array(16);
    const viewProjection = new Float32Array(16);
    const lightView = new Float32Array(16);
    const lightProjection = new Float32Array(16);
    const lightViewProjection = new Float32Array(16);
    const time = clock(gpu);
    let motionTime = 0;
    let orbit = 0;

    loop = frameLoop(gpu, (frame) => {
      try {
        if (disposed) return;
        if (state.flowers !== batchFlowers) rebuild();
        const dt = Math.min(time.deltaTime, 0.1);
        const still = state.reducedMotion;
        if (!still) motionTime += dt;
        const aspect = output.size[0] / Math.max(output.size[1], 1);

        let eye: Vec3;
        const camera = state.camera;
        if (camera.kind === "orbit") {
          if (!still) orbit += dt * camera.spin;
          const az = still ? 0 : orbit;
          const ce = Math.cos(camera.elevation);
          eye = [camera.target[0] + Math.sin(az) * ce * camera.distance, camera.target[1] + Math.sin(camera.elevation) * camera.distance, camera.target[2] + Math.cos(az) * ce * camera.distance];
          // Keep the whole plant in frame on tall, narrow canvases.
          const fov = aspect < 1 ? 2 * Math.atan(Math.tan(camera.fovY / 2) / Math.max(aspect, 0.45)) : camera.fovY;
          perspective(fov, aspect, Math.max(0.01, camera.distance * 0.05), camera.distance * 6, projection);
          lookAt(eye, camera.target, [0, 1, 0], view);
        } else {
          const ce = Math.cos(camera.elevation);
          eye = [camera.center[0], camera.center[1] + Math.sin(camera.elevation) * 40, camera.center[2] + ce * 40];
          const hh = camera.halfHeight;
          orthographic(-hh * aspect, hh * aspect, -hh, hh, 1, 80, projection);
          lookAt(eye, camera.center, [0, 1, 0], view);
        }
        multiply(projection, view, viewProjection);
        const right: Vec3 = [view[0]!, view[4]!, view[8]!];
        const up: Vec3 = [view[1]!, view[5]!, view[9]!];
        const toEye: Vec3 = [view[2]!, view[6]!, view[10]!];

        const sky = skyStateAt(state.time ?? new Date());
        const lighting = worldLightingFor(sky);
        // A painter's studio light: key from the upper left and a little in front.
        const lightDir = normalize([
          -right[0] * 0.55 + up[0] * 0.65 + toEye[0] * 0.5,
          -right[1] * 0.55 + up[1] * 0.65 + toEye[1] * 0.5,
          -right[2] * 0.55 + up[2] * 0.65 + toEye[2] * 0.5,
        ]);
        const r = bounds.radius;
        const c = bounds.center;
        lookAt([c[0] + lightDir[0] * r * 3, c[1] + lightDir[1] * r * 3, c[2] + lightDir[2] * r * 3], c, Math.abs(lightDir[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], lightView);
        orthographic(-r * 1.1, r * 1.1, -r * 1.1, r * 1.1, r * 0.5, r * 6, lightProjection);
        multiply(lightProjection, lightView, lightViewProjection);

        // Blow the seeds once the golden head is drawn (it is, from this frame on).
        const seeds = state.seeds;
        const first = batchFlowers?.[0];
        if (seeds && seeds.token !== blownToken && first && first.model.puffSeeds.length === 0) {
          blownToken = seeds.token;
          drift.blow({
            puff: seeds.puff,
            seed: seeds.seed,
            placement: first.placement,
            phase: first.phase,
            // Across the painting, a little toward the viewer.
            wind: [right[0] + toEye[0] * 0.3, 0, right[2] + toEye[2] * 0.3],
            speed: SEED_BREEZE,
            still,
          });
        }
        drift.step(frame, dt);

        const ambient = lighting.ambient.map((v) => v * 0.95 + 0.03);
        const world: WorldUniforms = {
          viewProjection,
          inverseViewProjection: viewProjection,
          lightViewProjection,
          eye,
          time: motionTime,
          lightDir,
          lightIntensity: Math.min(Math.max(lighting.lightIntensity, 0.85), 1.05) * 0.9,
          lightColor: lighting.lightColor,
          night: lighting.night,
          ambient,
          stars: 0,
          zenith: lighting.zenith,
          glow: lighting.glow,
          horizon: lighting.horizon,
          hoveredSpot: -1,
          fog: lighting.fog,
          fogDensity: 0,
          sunDir: lighting.sunDirection,
          aspect,
          moonDir: lighting.moonDirection,
          pixelScale: output.dpr,
          camRight: right,
          clipWater: 0,
          camUp: up,
          waterLevel: -1e4,
          lamp: [0, 0, 0],
          lampLevel: 0,
          lampColor: [0, 0, 0],
          lampFalloff: 1,
          showDim: 0,
          plotGlow: 0,
          plotBoost: 1,
          plotGrow: 1,
        };
        backdrop.set({ backdrop: state.backdrop === "sky" ? skyBackdrop(lighting) : plateBackdrop(lighting) });

        // The aura glows brighter as night falls. While a dandelion's seeds
        // blow away, its golden head's glow kindles as the puff's dissolves.
        const aura = state.aura * (1 + 0.6 * lighting.night);
        const kindle = 0.15 + 0.85 * smoothstep01(drift.sinceRelease / (still ? STILL_KINDLE : KINDLE));
        if (batch) {
          batch.setWorld(world);
          const params = { hovered: -1, sway: still ? 0 : state.sway, detailNear: 1e6, aura: aura * kindle };
          batch.setParams(params);
          batch.setShadowParams(params);
        }
        drift.setWorld(world);
        driftParams.sway = still ? 0 : state.sway;
        driftParams.glow = SEED_GLOW * (1 + 0.5 * lighting.night);
        driftParams.aura = aura;
        drift.setParams(driftParams);
        frame.pass({ target: shadowMap, clear: [1, 1, 1, 1], clearDepth: 1 }, (pass) => batch?.encodeShadow(pass));
        frame.pass({ target: scene, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
          pass.draw(backdrop);
          batch?.encode(pass);
          batch?.encodeAura(pass);
          drift.encode(pass);
        });
        frame.pass({ target: glowA, clear: [0, 0, 0, 1] }, (pass) => pass.draw(bright));
        for (let i = 0; i < 2; i += 1) {
          frame.pass({ target: glowB, clear: [0, 0, 0, 1] }, (pass) => pass.draw(blurH));
          frame.pass({ target: glowA, clear: [0, 0, 0, 1] }, (pass) => pass.draw(blurV));
        }
        frame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => pass.draw(composite));
        callbacks.onFrame?.({ viewProjection, width: canvas.clientWidth, height: canvas.clientHeight });
      } catch (error) {
        console.error("Flower studio frame failed", error);
        queueMicrotask(() => fail(error));
      }
    });
    callbacks.onReady();
  };

  start().catch((error: unknown) => fail(error));

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        // Keep releasing the rest.
      }
    }
    loop?.stop();
    gpu?.dispose();
    gpu = undefined;
  }

  return {
    update(next) {
      state = next;
    },
    dispose,
  };
}

type BackdropLighting = Pick<ReturnType<typeof worldLightingFor>, "zenith" | "horizon" | "night">;

/** The deep botanical plate, tinted by the sky. */
function plateBackdrop({ zenith: z, horizon: hz }: BackdropLighting) {
  return {
    top: [z[0]! * 0.04 + 0.004, z[1]! * 0.04 + 0.0035, z[2]! * 0.04 + 0.004],
    grain: 1,
    bottom: [hz[0]! * 0.012 + 0.002, hz[1]! * 0.012 + 0.002, hz[2]! * 0.012 + 0.002],
    style: 0,
    glow: [hz[0]! * 0.03, hz[1]! * 0.025, hz[2]! * 0.022],
    glowY: 0.38,
    ground: [0, 0, 0],
    horizonY: 0.6,
  };
}

/**
 * A darkened, colour-graded impression of the garden behind the flower: the
 * time of day's sky over a hazy horizon and a dim meadow. Kept well below the
 * flower's own brightness so its colours and aura still lead.
 */
function skyBackdrop({ zenith: z, horizon: hz, night }: BackdropLighting) {
  const sky = 0.2 + 0.08 * night;
  const haze = 0.16 + 0.06 * night;
  const meadow = 1 - 0.6 * night;
  return {
    top: [z[0]! * sky + 0.003, z[1]! * sky + 0.003, z[2]! * sky + 0.004],
    grain: 1,
    bottom: [hz[0]! * haze + 0.004, hz[1]! * haze + 0.004, hz[2]! * haze + 0.004],
    style: 1,
    glow: [hz[0]! * 0.05, hz[1]! * 0.04, hz[2]! * 0.035],
    glowY: 0.5,
    ground: [0.012 * meadow + hz[0]! * 0.01, 0.022 * meadow + hz[1]! * 0.01, 0.008 * meadow + hz[2]! * 0.008],
    horizonY: 0.66,
  };
}
