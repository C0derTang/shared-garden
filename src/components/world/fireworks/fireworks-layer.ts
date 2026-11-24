import { compute, draw, storage, type Compute, type Draw, type Gpu, type StorageBuffer, type Target } from "vgpu";
import {
  GRAVITY,
  MAX_SHELLS,
  MAX_SPARKS,
  SHELL_FLOATS,
  SPARK_FLOATS,
  STILL_FADE,
  STILL_HOLD,
  STILL_MOMENT,
  buildFireworksShow,
  fireworksLightAt,
  showDimAt,
  packFireworks,
  type FireworksShow,
} from "@/lib/world/fireworks";
import type { WorldFrameContext, WorldLayer, WorldLight } from "../world-layer";
import haloShader from "./fireworks-halo.wgsl";
import simShader from "./fireworks-sim.wgsl";
import sparksShader from "./fireworks-sparks.wgsl";

const WORKGROUP = 64;
const STATE_FLOATS = 8;
/** Steps used to settle the still sky at its moment. */
const STILL_STEPS = 30;
/** Fireworks light falls off gently: the meadow is ~70 units from the bursts. */
const LIGHT_FALLOFF = 0.0006;
const LIGHT_GAIN = 1.0;
const WIND: [number, number, number] = [0.35, 0, 0.08];

export interface FireworksPlayOptions {
  readonly seed: number;
  /** Reduced motion: a still sky of open bursts that fades after a while, instead of the animated show. */
  readonly still: boolean;
  /** A narrow portrait screen: bursts gather toward the middle of the lake. */
  readonly narrow?: boolean;
  /** The show's first frame was painted. */
  readonly onStart?: () => void;
  /** The show finished (or the world stopped under it). */
  readonly onEnd?: () => void;
}

export interface FireworksLayer extends WorldLayer {
  /** Starts a show over the lake (replacing any show in progress). */
  play(options: FireworksPlayOptions): void;
  /** Ends any show at once, without calling its `onEnd`. */
  stop(): void;
  /** True while a show is loaded or playing. */
  readonly playing: boolean;
}

interface Running {
  readonly options: FireworksPlayOptions;
  readonly show: FireworksShow;
  readonly sparkCount: number;
  readonly shellCount: number;
  /** Show seconds. */
  time: number;
  /** Wall seconds the still sky has been up. */
  held: number;
  started: boolean;
  /** Packed data waiting to be written to the GPU. */
  upload: ReturnType<typeof packFireworks> | null;
}

/**
 * World layer for the night fireworks: a compute pass simulates the shells'
 * particles; camera-facing streaks and soft sky glows draw additively into
 * the HDR scene (blooming through the painterly post-process) and into the
 * lake's mirror image; the open bursts light the meadow through the world's
 * local lamp. The show clock only advances while the world paints, so it
 * pauses behind the split view.
 */
export function createFireworksLayer(): FireworksLayer {
  let gpu: Gpu | undefined;
  let scene: Target | undefined;
  let mirror: Target | undefined;
  let sim: Compute | undefined;
  let sparksDraw: Draw | undefined;
  let haloDraw: Draw | undefined;
  let sparkBuffer: StorageBuffer | undefined;
  let stateBuffer: StorageBuffer | undefined;
  let shellBuffer: StorageBuffer | undefined;
  let running: Running | null = null;
  let fade = 1;

  const finish = (notify: boolean) => {
    const done = running;
    running = null;
    if (notify && done?.options.onEnd) queueMicrotask(done.options.onEnd);
  };

  const upload = (show: Running) => {
    if (!show.upload || !sparkBuffer || !stateBuffer || !shellBuffer) return;
    const packed = show.upload;
    sparkBuffer.write(packed.sparks);
    shellBuffer.write(packed.shells);
    // Every particle starts unborn (age -1).
    const states = new Float32Array(Math.max(1, packed.sparkCount) * STATE_FLOATS);
    for (let i = 0; i < packed.sparkCount; i += 1) states[i * STATE_FLOATS + 3] = -1;
    stateBuffer.write(states);
    show.upload = null;
  };

  const step = (frame: Parameters<NonNullable<WorldLayer["update"]>>[0], show: Running, dt: number) => {
    sim!.set({ sim: { time: show.time, dt, count: show.sparkCount, gravity: GRAVITY, wind: WIND, turbulence: 0.55 } });
    frame.computePass({ label: "garden-world.fireworks" }, (pass) => pass.dispatch(sim!, Math.max(1, Math.ceil(show.sparkCount / WORKGROUP))));
  };

  const encode = (pass: Parameters<WorldLayer["draw"]>[0], frame: WorldFrameContext, target: Target, gain: number) => {
    if (!running || running.upload || !running.started || !sparksDraw || !haloDraw) return;
    const show = running;
    const twinkle = show.show.still ? STILL_MOMENT : show.time;
    haloDraw.set({ world: frame.world, halo: { time: show.time, fade, gain, pad: 0 } });
    pass.draw(haloDraw, { instances: show.shellCount, vertices: 6 });
    sparksDraw.set({ world: frame.world, view: { viewportHeight: target.size[1], fade, time: twinkle, gain } });
    pass.draw(sparksDraw, { instances: show.sparkCount, vertices: 6 });
  };

  return {
    get playing() {
      return running !== null;
    },
    async setup(context) {
      gpu = context.gpu;
      scene = context.sceneTarget;
      mirror = context.mirrorTarget;
      sparkBuffer = storage(gpu, MAX_SPARKS * SPARK_FLOATS * 4, "read");
      stateBuffer = storage(gpu, MAX_SPARKS * STATE_FLOATS * 4, "read-write");
      shellBuffer = storage(gpu, MAX_SHELLS * SHELL_FLOATS * 4, "read");
      sim = compute(gpu, simShader, { label: "garden-world.fireworks-sim", set: { sparks: sparkBuffer, states: stateBuffer } });
      sparksDraw = draw(gpu, {
        shader: sparksShader,
        vertices: 6,
        // Colour adds; alpha is replaced by the sparks' near-distance code for the painterly filter.
        blend: { color: { src: "one", dst: "one" }, alpha: { src: "one", dst: "zero" } },
        depth: { write: false, compare: "less-equal" },
        label: "garden-world.fireworks-sparks",
        set: { sparks: sparkBuffer, states: stateBuffer },
      });
      haloDraw = draw(gpu, {
        shader: haloShader,
        vertices: 6,
        blend: "additive",
        writeMask: ["r", "g", "b"],
        depth: { write: false, compare: "less-equal" },
        label: "garden-world.fireworks-halo",
        set: { shells: shellBuffer },
      });
      await Promise.all([sim.compile(), sparksDraw.compile(scene), sparksDraw.compile(mirror), haloDraw.compile(scene), haloDraw.compile(mirror)]);
    },
    play(options) {
      finish(false);
      const show = buildFireworksShow(options.seed, { still: options.still, narrow: options.narrow });
      const packed = packFireworks(show, options.seed);
      running = {
        options,
        show,
        sparkCount: packed.sparkCount,
        shellCount: packed.shellCount,
        time: 0,
        held: 0,
        started: false,
        upload: packed,
      };
      fade = 1;
    },
    stop() {
      finish(false);
    },
    update(frame, { dt }): WorldLight | null {
      const show = running;
      if (!show || !sim) return null;
      if (show.upload) upload(show);
      if (!show.started) {
        show.started = true;
        if (show.options.onStart) queueMicrotask(show.options.onStart);
        if (show.show.still) {
          // Settle every burst at its open moment, then hold it there.
          for (let i = 1; i <= STILL_STEPS; i += 1) {
            show.time = (STILL_MOMENT * i) / STILL_STEPS;
            step(frame, show, STILL_MOMENT / STILL_STEPS);
          }
        }
      }
      if (show.show.still) {
        show.held += dt;
        fade = show.held < STILL_HOLD ? 1 : Math.max(0, 1 - (show.held - STILL_HOLD) / STILL_FADE);
        if (fade <= 0) {
          finish(true);
          return null;
        }
      } else if (dt > 0) {
        show.time += dt;
        if (show.time > show.show.duration) {
          finish(true);
          return null;
        }
        step(frame, show, dt);
      }
      const light = fireworksLightAt(show.show, show.time);
      const skyDim = showDimAt(show.show, show.time) * fade;
      if (!light) return { position: [0, 12, -50], color: [0, 0, 0], level: 0, falloff: LIGHT_FALLOFF, skyDim };
      return { position: light.position, color: light.color, level: light.level * LIGHT_GAIN * fade, falloff: LIGHT_FALLOFF, skyDim };
    },
    drawReflection(pass, frame) {
      if (mirror) encode(pass, frame, mirror, 2.0);
    },
    draw(pass, frame) {
      if (scene) encode(pass, frame, scene, 1);
    },
    dispose() {
      // The world stopped (or lost its GPU) under the show: end it.
      finish(true);
      sim?.dispose();
      sparksDraw?.dispose();
      haloDraw?.dispose();
      sim = undefined;
      sparksDraw = undefined;
      haloDraw = undefined;
      sparkBuffer = undefined;
      stateBuffer = undefined;
      shellBuffer = undefined;
      gpu = undefined;
      scene = undefined;
      mirror = undefined;
    },
  };
}
