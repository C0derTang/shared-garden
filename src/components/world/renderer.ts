import {
  clock,
  draw,
  effect,
  frameLoop,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type FrameLoopHandle,
  type Geometry,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import { invert, lookAt, multiply, orthographic, perspective, rayFromNdc } from "@/lib/world/camera";
import { journeyPose } from "@/lib/world/journey";
import { bedEdgingRocks, buildMountainMesh, buildRockMesh, shoreRocks } from "@/lib/world/landforms";
import { WATER_LEVEL, bedCountFor, layoutPlantingSpots, type Vec3 } from "@/lib/world/layout";
import { pickAlongRay, type FlowerAnchor, type PickResult } from "@/lib/world/picking";
import {
  buildBedMesh,
  buildFarShoreStrokes,
  buildGroundMesh,
  buildMeadowStrokes,
  buildNearShoreStrokes,
  type MeshData,
} from "@/lib/world/scenery";
import { skyStateAt } from "@/lib/world/solar";
import { worldLightingFor } from "@/lib/world/sky-palette";
import blurShader from "./post/blur.wgsl";
import brightShader from "./post/bright.wgsl";
import compositeShader from "./post/composite.wgsl";
import kuwaharaShader from "./post/kuwahara.wgsl";
import prepShader from "./post/prep.wgsl";
import tensorShader from "./post/tensor.wgsl";
import bedShader from "./shaders/bed.wgsl";
import groundShader from "./shaders/ground.wgsl";
import markerShader from "./shaders/marker.wgsl";
import mountainShader from "./shaders/mountain.wgsl";
import motesShader from "./shaders/motes.wgsl";
import rockShader from "./shaders/rock.wgsl";
import skyShader from "./shaders/sky.wgsl";
import waterShader from "./shaders/water.wgsl";
import { maxDprFor, watchDeviceLoss } from "./device-loss";
import { createStrokeBatch, type StrokeBatch } from "./strokes/stroke-batch";
import type { WorldFrameContext, WorldLayer, WorldShadow, WorldUniforms } from "./world-layer";

const HDR: GPUTextureFormat = "rgba16float";
const MOTE_COUNT = 70;
const FOG_DENSITY = 0.0022;
const SHADOW_SIZE = 2048;
/** Pixel budget of the scene and painterly chain; the canvas itself stays at full DPR. */
const RENDER_BUDGET = 1_900_000;
/** Ground area (centre and half extent) covered by the key light's shadow map. */
const SHADOW_CENTER: Vec3 = [0, 0, 3];
const SHADOW_EXTENT = 30;
const CLICK_SLOP_PX = 6;
const RGB_ONLY: ("r" | "g" | "b")[] = ["r", "g", "b"];

export interface WorldSceneState {
  readonly spotCapacity: number;
  readonly occupiedSpots: readonly number[];
  readonly flowers: readonly FlowerAnchor[];
  readonly layers: readonly WorldLayer[];
  /** Fixed sky time; null follows the live clock. */
  readonly time: Date | null;
  readonly reducedMotion: boolean;
}

/** Per-frame camera handed to DOM overlays (e.g. floating captions). */
export interface WorldView {
  readonly viewProjection: Float32Array;
  /** Canvas size in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

export interface WorldRendererCallbacks {
  onReady(): void;
  /** WebGPU (adapter/device) is unavailable in this browser. */
  onUnsupported(error: unknown): void;
  /** The world failed at run time (setup or a frame threw) on a capable browser. */
  onError(error: unknown): void;
  /** The GPU device was lost (driver reset, OS reclaim). The renderer has already disposed itself. */
  onLost(info: GPUDeviceLostInfo): void;
  onPick(result: PickResult): void;
  onFrame?(view: WorldView): void;
}

export interface WorldRenderer {
  update(state: WorldSceneState): void;
  /** Moves along the camera journey by `delta` (0 = overview .. 1 = among the beds). */
  travel(delta: number): void;
  dispose(): void;
}

const GROUND_ATTRIBUTES = { position: "float32x3", normal: "float32x3" } as const;
const BED_ATTRIBUTES = { position: "float32x3", normal: "float32x3", local: "float32x3" } as const;
const ROCK_ATTRIBUTES = { position: "float32x3", normal: "float32x3", tone: "float32x2" } as const;

function meshGeometry(gpu: Gpu, mesh: MeshData, attributes: Record<string, GPUVertexFormat>, label: string): Geometry {
  return geometry(gpu, {
    label,
    buffers: [{ data: mesh.vertices, stride: mesh.stride * 4, attributes }],
    indices: mesh.indices,
  });
}

function waterGeometry(gpu: Gpu): Geometry {
  const vertices = new Float32Array([-260, 0, 6, 260, 0, 6, 260, 0, -160, -260, 0, -160]);
  return geometry(gpu, {
    label: "garden-world.water",
    buffers: [{ data: vertices, attributes: { position: "float32x3" } }],
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}

/** Mirror matrix across the horizontal plane y = level (column-major). */
function mirrorY(level: number): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = -1;
  m[10] = 1;
  m[13] = 2 * level;
  m[15] = 1;
  return m;
}

/** Starts the painted world on `canvas`. Everything GPU-side is released by `dispose()`. */
export function createWorldRenderer(
  canvas: HTMLCanvasElement,
  initial: WorldSceneState,
  callbacks: WorldRendererCallbacks,
): WorldRenderer {
  let state = initial;
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: (() => void)[] = [];
  const setUpLayers = new Set<WorldLayer>();
  const readyLayers = new Set<WorldLayer>();

  const pointer = { x: 0, y: 0, smoothX: 0, smoothY: 0, downX: 0, downY: 0, down: false, touchY: 0 };
  const journey = { target: 0, value: 0 };
  let hovered: PickResult | null = null;
  const inverseViewProjection = new Float32Array(16);
  let cameraReady = false;

  const emptySpotTargets = () => {
    const occupied = new Set(state.occupiedSpots);
    return layoutPlantingSpots(state.spotCapacity)
      .filter((spot) => !occupied.has(spot.spot))
      .map((spot) => ({ spot: spot.spot, position: spot.position }));
  };
  let emptySpots = emptySpotTargets();

  const pickAt = (clientX: number, clientY: number): PickResult | null => {
    if (!cameraReady) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((clientY - rect.top) / rect.height) * 2;
    return pickAlongRay(rayFromNdc(inverseViewProjection, ndcX, ndcY), emptySpots, state.flowers);
  };

  const travel = (delta: number) => {
    journey.target = Math.min(1, Math.max(0, journey.target + delta));
  };

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1;
    pointer.y = 1 - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2;
    if (pointer.down && event.pointerType === "touch") {
      travel((pointer.touchY - event.clientY) / Math.max(rect.height, 1));
      pointer.touchY = event.clientY;
    }
    hovered = pickAt(event.clientX, event.clientY);
    canvas.style.cursor = hovered ? "pointer" : "";
  };
  const onPointerDown = (event: PointerEvent) => {
    pointer.down = true;
    pointer.downX = event.clientX;
    pointer.downY = event.clientY;
    pointer.touchY = event.clientY;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!pointer.down) return;
    pointer.down = false;
    if (Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > CLICK_SLOP_PX) return;
    const result = pickAt(event.clientX, event.clientY);
    if (result) callbacks.onPick(result);
  };
  const onPointerLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
    pointer.down = false;
    hovered = null;
    canvas.style.cursor = "";
  };
  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    travel(pixels / 1400);
  };
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  cleanups.push(() => {
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
    canvas.style.cursor = "";
  });

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
      // No adapter or device: this browser cannot paint the world.
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
    // Keep the canvas backing store within the device's texture limit on very large screens.
    const largestSide = Math.max(canvas.clientWidth, canvas.clientHeight, globalThis.screen?.width ?? 0, globalThis.screen?.height ?? 0);
    const dprCap = maxDprFor(largestSide, nextGpu.gpu.limits.maxTextureDimension2D);
    const output: Surface = surface(gpu, canvas, { dpr: [Math.min(1, dprCap), dprCap], label: "garden-world" });
    // Internal render scale: native up to the pixel budget, smoothly upsampled beyond it.
    const renderScale = () => Math.min(1, Math.sqrt(RENDER_BUDGET / Math.max(1, output.size[0] * output.size[1])));
    const full = (): [number, number] => {
      const k = renderScale();
      return [Math.max(1, Math.round(output.size[0] * k)), Math.max(1, Math.round(output.size[1] * k))];
    };
    const half = (): [number, number] => {
      const [w, h] = full();
      return [Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2))];
    };

    const scene: Target = target(gpu, { size: full(), format: HDR, depth: true, msaa: true, label: "garden-world.scene" });
    const mirror: Target = target(gpu, { size: half(), format: HDR, depth: true, label: "garden-world.mirror" });
    const glowA: Target = target(gpu, { size: half(), format: HDR, label: "garden-world.glow-a" });
    const glowB: Target = target(gpu, { size: half(), format: HDR, label: "garden-world.glow-b" });
    // The painterly chain runs at full resolution so no cell or pixel structure shows.
    const prepped: Target = target(gpu, { size: full(), format: HDR, label: "garden-world.prep" });
    const structure: Target = target(gpu, { size: full(), format: HDR, label: "garden-world.tensor" });
    const structureBlur: Target = target(gpu, { size: full(), format: HDR, label: "garden-world.tensor-blur" });
    const painted: Target = target(gpu, { size: full(), format: HDR, label: "garden-world.paint" });
    const shadowMap: Target = target(gpu, { size: [SHADOW_SIZE, SHADOW_SIZE], format: "r8unorm", depth: "depth32float", label: "garden-world.shadow" });
    const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const shadowSampler = sampler(gpu, { compare: "less-equal", minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    const shadow: WorldShadow = { map: shadowMap, sampler: shadowSampler };
    const shadowBindings = { shadowMap, shadowSampler };

    const sky = draw(gpu, { shader: skyShader, vertices: 3, depth: false, label: "garden-world.sky" });
    const ground = draw(gpu, {
      shader: groundShader,
      geometry: meshGeometry(gpu, buildGroundMesh(), GROUND_ATTRIBUTES, "garden-world.ground"),
      label: "garden-world.ground",
      set: shadowBindings,
    });
    const mountains = draw(gpu, {
      shader: mountainShader,
      geometry: meshGeometry(gpu, buildMountainMesh(), GROUND_ATTRIBUTES, "garden-world.mountains"),
      label: "garden-world.mountains",
    });
    const rocks = draw(gpu, {
      shader: rockShader,
      geometry: meshGeometry(gpu, buildRockMesh(shoreRocks()), ROCK_ATTRIBUTES, "garden-world.rocks"),
      label: "garden-world.rocks",
      set: shadowBindings,
    });
    const water = draw(gpu, { shader: waterShader, geometry: waterGeometry(gpu), label: "garden-world.water" });
    const motes = draw(gpu, {
      shader: motesShader,
      vertices: 6,
      instances: MOTE_COUNT,
      blend: "additive",
      writeMask: RGB_ONLY,
      depth: { write: false, compare: "less-equal" },
      label: "garden-world.motes",
    });
    const farShore = createStrokeBatch(gpu, buildFarShoreStrokes(), { label: "garden-world.far-shore", shadow });
    const nearShore = createStrokeBatch(gpu, buildNearShoreStrokes(), { label: "garden-world.near-shore", shadow, castShadows: true });

    // Bed-dependent pieces are rebuilt when beds open.
    let bedCount = -1;
    let meadow: StrokeBatch | undefined;
    let beds: Draw | undefined;
    let bedGeometry: Geometry | undefined;
    let edging: Draw | undefined;
    let edgingGeometry: Geometry | undefined;
    let markers: Draw | undefined;
    let markerGeometry: Geometry | undefined;
    let markerCount = 0;
    let markerKey = "";

    const rebuildBeds = () => {
      const nextCount = bedCountFor(state.spotCapacity);
      if (nextCount === bedCount) return;
      bedCount = nextCount;
      meadow?.dispose();
      beds?.dispose();
      bedGeometry?.destroy();
      edging?.dispose();
      edgingGeometry?.destroy();
      meadow = createStrokeBatch(gpu!, buildMeadowStrokes(bedCount), { label: "garden-world.meadow", shadow });
      edgingGeometry = meshGeometry(gpu!, buildRockMesh(bedEdgingRocks(bedCount)), ROCK_ATTRIBUTES, "garden-world.edging");
      edging = draw(gpu!, { shader: rockShader, geometry: edgingGeometry, label: "garden-world.edging", set: shadowBindings });
      bedGeometry = meshGeometry(gpu!, buildBedMesh(bedCount), BED_ATTRIBUTES, "garden-world.beds");
      beds = draw(gpu!, {
        shader: bedShader,
        geometry: bedGeometry,
        depth: { write: true, compare: "less-equal", bias: -4, biasSlopeScale: -1 },
        label: "garden-world.beds",
        set: shadowBindings,
      });
    };

    const rebuildMarkers = () => {
      const key = emptySpots.map((spot) => spot.spot).join(",");
      if (key === markerKey) return;
      markerKey = key;
      markers?.dispose();
      markerGeometry?.destroy();
      markers = undefined;
      markerGeometry = undefined;
      markerCount = emptySpots.length;
      if (markerCount === 0) return;
      const data = new Float32Array(markerCount * 4);
      emptySpots.forEach((spot, i) => data.set([...spot.position, spot.spot], i * 4));
      markerGeometry = geometry(gpu!, {
        label: "garden-world.markers",
        buffers: [{ data, stepMode: "instance", attributes: { spot: "float32x4" } }],
      });
      markers = draw(gpu!, {
        shader: markerShader,
        geometry: markerGeometry,
        vertices: 6,
        blend: "additive",
        writeMask: RGB_ONLY,
        depth: { write: false, compare: "less-equal" },
        label: "garden-world.markers",
      });
    };

    rebuildBeds();
    rebuildMarkers();

    const bright = effect(gpu, brightShader, { label: "garden-world.bright" });
    const blurH = effect(gpu, blurShader, { label: "garden-world.blur-h" });
    const blurV = effect(gpu, blurShader, { label: "garden-world.blur-v" });
    const prep = effect(gpu, prepShader, { label: "garden-world.prep" });
    const tensor = effect(gpu, tensorShader, { label: "garden-world.tensor" });
    const tensorBlurH = effect(gpu, blurShader, { label: "garden-world.tensor-blur-h" });
    const tensorBlurV = effect(gpu, blurShader, { label: "garden-world.tensor-blur-v" });
    const kuwahara = effect(gpu, kuwaharaShader, { label: "garden-world.kuwahara" });
    const composite = effect(gpu, compositeShader, { label: "garden-world.composite" });

    const bind = () => {
      const [w, h] = scene.size;
      const [hw, hh] = glowA.size;
      water.set({ reflection: mirror, reflectionSampler: linear, water: { texel: [1 / w, 1 / h], distortion: 0.12, pad: 0 } });
      bright.set({ source: scene, sourceSampler: linear, params: { texel: [1 / w, 1 / h], threshold: 1.1, knee: 0.5 } });
      blurH.set({ source: glowA, sourceSampler: linear, params: { direction: [1.6 / hw, 0], pad: [0, 0] } });
      blurV.set({ source: glowB, sourceSampler: linear, params: { direction: [0, 1.6 / hh], pad: [0, 0] } });
      const pixel = output.dpr * renderScale();
      prep.set({ scene, linearSampler: linear, params: { texel: [1 / w, 1 / h], exposure: 1, pad: 0 } });
      tensor.set({ source: prepped, linearSampler: linear, params: { texel: [1 / w, 1 / h], pad: [0, 0] } });
      tensorBlurH.set({ source: structure, sourceSampler: linear, params: { direction: [(2 * pixel) / w, 0], pad: [0, 0] } });
      tensorBlurV.set({ source: structureBlur, sourceSampler: linear, params: { direction: [0, (2 * pixel) / h], pad: [0, 0] } });
      kuwahara.set({ source: prepped, tensor: structure, linearSampler: linear, params: { texel: [1 / w, 1 / h], radiusNear: 2.5 * pixel, radiusFar: 5.5 * pixel } });
      composite.set({
        paint: painted,
        scene,
        tensor: structure,
        glow: glowA,
        linearSampler: linear,
        params: { texel: [1 / output.size[0], 1 / output.size[1]], resolution: [output.size[0], output.size[1]], glowStrength: 0.7, exposure: 1, night: 0, grain: 1 },
      });
    };
    bind();

    cleanups.push(
      output.onResize(() => {
        if (disposed) return;
        for (const t of [scene, prepped, structure, structureBlur, painted]) t.resize(full());
        for (const t of [mirror, glowA, glowB]) t.resize(half());
        bind();
      }),
    );

    await Promise.all([
      sky.compile(scene),
      sky.compile(mirror),
      ground.compile(scene),
      ground.compile(mirror),
      mountains.compile(scene),
      mountains.compile(mirror),
      rocks.compile(scene),
      rocks.compile(mirror),
      edging!.compile(scene),
      water.compile(scene),
      motes.compile(scene),
      farShore.compile(scene),
      farShore.compile(mirror),
      nearShore.compile(scene),
      nearShore.compile(mirror),
      meadow!.compile(scene),
      beds!.compile(scene),
      ...(markers ? [markers.compile(scene)] : []),
      bright.compile(glowA),
      blurH.compile(glowB),
      blurV.compile(glowA),
      prep.compile(prepped),
      tensor.compile(structure),
      tensorBlurH.compile(structureBlur),
      tensorBlurV.compile(structure),
      kuwahara.compile(painted),
      composite.compile(output),
    ]);
    if (disposed) return;

    const view = new Float32Array(16);
    const projection = new Float32Array(16);
    const viewProjection = new Float32Array(16);
    const mirrorView = new Float32Array(16);
    const mirrorViewProjection = new Float32Array(16);
    const mirrorInverse = new Float32Array(16);
    const reflect = mirrorY(WATER_LEVEL);
    const lightView = new Float32Array(16);
    const lightProjection = orthographic(-SHADOW_EXTENT, SHADOW_EXTENT, -SHADOW_EXTENT, SHADOW_EXTENT, 1, 220);
    const lightViewProjection = new Float32Array(16);

    const time = clock(gpu);
    let motionTime = 0;
    let previousLayers: readonly WorldLayer[] = [];

    const syncLayers = () => {
      if (state.layers === previousLayers) return;
      for (const layer of previousLayers) {
        if (!state.layers.includes(layer)) {
          layer.dispose?.();
          setUpLayers.delete(layer);
          readyLayers.delete(layer);
        }
      }
      previousLayers = state.layers;
      for (const layer of state.layers) {
        if (setUpLayers.has(layer)) continue;
        setUpLayers.add(layer);
        void Promise.resolve(layer.setup?.({ gpu: gpu!, sceneTarget: scene, shadow }))
          .then(() => {
            if (setUpLayers.has(layer)) readyLayers.add(layer);
          })
          .catch((error: unknown) => {
            console.error("Garden world layer failed to set up", error);
          });
      }
    };

    loop = frameLoop(gpu, (currentFrame) => {
      try {
        if (disposed) return;
        syncLayers();
        rebuildBeds();
        rebuildMarkers();

        const dt = Math.min(time.deltaTime, 0.1);
        const still = state.reducedMotion;
        if (!still) motionTime += dt;
        const follow = still ? 1 : Math.min(1, dt * 2.5);
        pointer.smoothX += ((still ? 0 : pointer.x) - pointer.smoothX) * follow;
        pointer.smoothY += ((still ? 0 : pointer.y) - pointer.smoothY) * follow;
        journey.value += (journey.target - journey.value) * (still ? 1 : Math.min(1, dt * 2));

        const [w, h] = scene.size;
        const aspect = output.size[0] / Math.max(output.size[1], 1);
        const fovY = Math.min((68 * Math.PI) / 180, Math.max((38 * Math.PI) / 180, 2 * Math.atan(Math.tan((24 * Math.PI) / 180) / Math.max(aspect, 0.01))));
        perspective(fovY, aspect, 0.1, 420, projection);
        const pose = journeyPose(journey.value);
        const t = motionTime;
        const eye: Vec3 = [
          pose.eye[0] + Math.sin(t * 0.11) * 0.25 + pointer.smoothX * 0.6,
          pose.eye[1] + Math.sin(t * 0.07) * 0.06 + pointer.smoothY * 0.2,
          pose.eye[2],
        ];
        // Portrait screens tilt down a little so the garden, not the sky, fills the frame.
        const portraitTilt = (1 - Math.min(aspect, 1)) * 7;
        const look: Vec3 = [pose.look[0] + Math.sin(t * 0.09 + 1) * 0.1 + pointer.smoothX * 0.12, pose.look[1] - portraitTilt + pointer.smoothY * 0.06, pose.look[2]];
        lookAt(eye, look, [0, 1, 0], view);
        multiply(projection, view, viewProjection);
        invert(viewProjection, inverseViewProjection);
        cameraReady = true;
        multiply(view, reflect, mirrorView);
        multiply(projection, mirrorView, mirrorViewProjection);
        invert(mirrorViewProjection, mirrorInverse);
        const right: Vec3 = [view[0]!, view[4]!, view[8]!];
        const up: Vec3 = [view[1]!, view[5]!, view[9]!];
        const mirroredEye: Vec3 = [eye[0], 2 * WATER_LEVEL - eye[1], eye[2]];

        const now = state.time ?? new Date();
        const skyState = skyStateAt(now);
        const lighting = worldLightingFor(skyState);
        const lightDir = lighting.lightDirection;
        const lightEye: Vec3 = [SHADOW_CENTER[0] + lightDir[0] * 100, SHADOW_CENTER[1] + lightDir[1] * 100, SHADOW_CENTER[2] + lightDir[2] * 100];
        lookAt(lightEye, SHADOW_CENTER, Math.abs(lightDir[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0], lightView);
        multiply(lightProjection, lightView, lightViewProjection);
        const world: WorldUniforms = {
          viewProjection,
          inverseViewProjection,
          lightViewProjection,
          eye,
          time: motionTime,
          lightDir: lighting.lightDirection,
          lightIntensity: lighting.lightIntensity,
          lightColor: lighting.lightColor,
          night: lighting.night,
          ambient: lighting.ambient,
          stars: lighting.stars,
          zenith: lighting.zenith,
          glow: lighting.glow,
          horizon: lighting.horizon,
          hoveredSpot: hovered?.kind === "spot" ? hovered.spot : -1,
          fog: lighting.fog,
          fogDensity: FOG_DENSITY,
          sunDir: lighting.sunDirection,
          aspect,
          moonDir: lighting.moonDirection,
          pixelScale: output.dpr,
          camRight: right,
          clipWater: 0,
          camUp: up,
          waterLevel: WATER_LEVEL,
        };
        const mirrored: WorldUniforms = {
          ...world,
          viewProjection: mirrorViewProjection,
          inverseViewProjection: mirrorInverse,
          eye: mirroredEye,
          clipWater: 1,
        };

        const context: WorldFrameContext = {
          gpu: gpu!,
          viewProjection,
          eye,
          time: motionTime,
          reducedMotion: still,
          lighting,
          sky: skyState,
          hoveredFlowerId: hovered?.kind === "flower" ? hovered.id : null,
          world,
        };

        // 0. Key-light shadow map (trees, reeds and layers such as the flowers cast; leaves are alpha-tested).
        nearShore.setWorld(world);
        currentFrame.pass({ target: shadowMap, clear: [1, 1, 1, 1], clearDepth: 1 }, (pass) => {
          nearShore.encodeShadow(pass);
          for (const layer of state.layers) {
            if (readyLayers.has(layer)) layer.drawShadow?.(pass, context);
          }
        });

        // 1. The lake's mirror image (sky, mountains, shores, stones and trees).
        for (const drawable of [sky, ground, mountains, rocks]) drawable.set({ world: mirrored });
        farShore.setWorld(mirrored);
        nearShore.setWorld(mirrored);
        currentFrame.pass({ target: mirror, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
          pass.draw(sky);
          pass.draw(mountains);
          pass.draw(ground);
          pass.draw(rocks);
          farShore.encode(pass);
          nearShore.encode(pass);
        });

        // 2. The scene.
        for (const drawable of [sky, ground, mountains, rocks, water, motes, beds!, edging!, ...(markers ? [markers] : [])]) drawable.set({ world });
        for (const batch of [farShore, nearShore, meadow!]) batch.setWorld(world);
        currentFrame.pass({ target: scene, clear: [0, 0, 0, 1], clearDepth: 1 }, (pass) => {
          pass.draw(sky);
          pass.draw(mountains);
          pass.draw(ground);
          pass.draw(water);
          pass.draw(rocks);
          pass.draw(beds!);
          pass.draw(edging!);
          farShore.encode(pass);
          nearShore.encode(pass);
          meadow!.encode(pass);
          for (const layer of state.layers) {
            if (readyLayers.has(layer)) layer.draw(pass, context);
          }
          if (markers && markerCount > 0) pass.draw(markers, { instances: markerCount, vertices: 6 });
          pass.draw(motes, { instances: MOTE_COUNT, vertices: 6 });
        });

        // 3. Glow, then the painterly chain.
        const exposure = 0.8 + lighting.glow * 0.2 + lighting.night * 0.55;
        prep.set({ params: { texel: [1 / w, 1 / h], exposure, pad: 0 } });
        composite.set({
          params: {
            texel: [1 / output.size[0], 1 / output.size[1]],
            resolution: [output.size[0], output.size[1]],
            glowStrength: 0.55 + lighting.night * 0.35,
            exposure,
            night: lighting.night,
            grain: 1,
          },
        });
        currentFrame.pass({ target: glowA, clear: [0, 0, 0, 1] }, (pass) => pass.draw(bright));
        currentFrame.pass({ target: glowB, clear: [0, 0, 0, 1] }, (pass) => pass.draw(blurH));
        currentFrame.pass({ target: glowA, clear: [0, 0, 0, 1] }, (pass) => pass.draw(blurV));
        currentFrame.pass({ target: prepped, clear: [0, 0, 0, 1] }, (pass) => pass.draw(prep));
        currentFrame.pass({ target: structure, clear: [0, 0, 0, 1] }, (pass) => pass.draw(tensor));
        currentFrame.pass({ target: structureBlur, clear: [0, 0, 0, 1] }, (pass) => pass.draw(tensorBlurH));
        currentFrame.pass({ target: structure, clear: [0, 0, 0, 1] }, (pass) => pass.draw(tensorBlurV));
        currentFrame.pass({ target: painted, clear: [0, 0, 0, 1] }, (pass) => pass.draw(kuwahara));
        currentFrame.pass({ target: output, clear: [0, 0, 0, 1] }, (pass) => pass.draw(composite));

        callbacks.onFrame?.({ viewProjection, width: canvas.clientWidth, height: canvas.clientHeight });
      } catch (error) {
        // A throwing tick ends vgpu's loop; dispose and report the error so the
        // component can show its "stopped" notice instead of a frozen canvas.
        // (Device loss is reported separately through gpu.lost.)
        console.error("Garden world frame failed", error);
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
    for (const layer of setUpLayers) {
      try {
        layer.dispose?.();
      } catch {
        // Layers own their own resources; keep going.
      }
    }
    setUpLayers.clear();
    readyLayers.clear();
    // Releases every target, draw, geometry and the surface created from this context.
    gpu?.dispose();
    gpu = undefined;
  }

  return {
    update(next) {
      state = next;
      emptySpots = emptySpotTargets();
    },
    travel,
    dispose,
  };
}
