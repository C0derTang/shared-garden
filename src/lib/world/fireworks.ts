import { WATER_LEVEL, type Vec3 } from "./layout";

/**
 * The night fireworks show (#184): a deterministic schedule of shells launched
 * from the water across the lake and burst over it, packed into particle
 * records for the GPU simulation (`components/world/fireworks`).
 */

export const SHELL_TYPES = ["peony", "chrysanthemum", "willow", "ring", "heart", "crackle"] as const;
export type ShellType = (typeof SHELL_TYPES)[number];

/** Particle kinds understood by the shaders. */
export const SPARK_KIND = { rocket: 0, trail: 1, star: 2, comet: 3, willow: 4, crackle: 5 } as const;

/** Floats per particle record (`Spark` in fireworks-common.wgsl). */
export const SPARK_FLOATS = 20;
/** Floats per shell record (`Shell` in fireworks-common.wgsl). */
export const SHELL_FLOATS = 12;
/** Upper bound of particles in one show (GPU pool size). */
export const MAX_SPARKS = 24_576;
/** Upper bound of shells in one show. */
export const MAX_SHELLS = 64;
/** Wall-clock seconds the still (reduced-motion) sky stays up before fading. */
export const STILL_HOLD = 16;
/** Seconds the still sky takes to fade away. */
export const STILL_FADE = 1.4;
/** Show time at which the still sky is frozen (every burst is open). */
export const STILL_MOMENT = 0.75;
/** World gravity for sparks (units / s²). */
export const GRAVITY = 2.6;
/**
 * Where bursts may open (world x): between the framing trees and to the right
 * of the moon, which hangs over the left of the lake.
 */
export const BURST_X: readonly [number, number] = [-9, 25];
/** The burst lane on narrow portrait screens, which see less of the lake's width. */
export const BURST_X_NARROW: readonly [number, number] = [-9, 13];

type Rgb = readonly [number, number, number];

/** Distinct firework colours (linear-light, before HDR intensity). */
export const FIREWORK_COLORS = {
  gold: [1.0, 0.68, 0.24],
  rose: [1.0, 0.3, 0.45],
  violet: [0.66, 0.4, 1.0],
  teal: [0.25, 0.9, 0.85],
  white: [1.0, 0.94, 0.84],
  coral: [1.0, 0.36, 0.2],
  green: [0.5, 1.0, 0.4],
  blue: [0.38, 0.55, 1.0],
} as const satisfies Record<string, Rgb>;
const C = FIREWORK_COLORS;
const PALETTE: readonly Rgb[] = [C.gold, C.rose, C.violet, C.teal, C.white, C.coral, C.green, C.blue];
/** Hue shifts a star may drift through as it burns (start → end). */
const SHIFTS: readonly (readonly [Rgb, Rgb])[] = [
  [C.gold, C.rose],
  [C.teal, C.violet],
  [C.white, C.blue],
  [C.rose, C.violet],
  [C.green, C.gold],
  [C.coral, C.gold],
  [C.violet, C.rose],
  [C.blue, C.teal],
];

export interface Shell {
  readonly type: ShellType;
  /** Show seconds when the rocket leaves the water. */
  readonly launch: number;
  /** Seconds of rocket flight; the burst happens at `launch + flight`. */
  readonly flight: number;
  readonly base: Vec3;
  readonly burst: Vec3;
  /** Approximate burst radius (world units). */
  readonly radius: number;
  readonly color: Rgb;
  /** The colour its stars drift toward as they burn. */
  readonly fade: Rgb;
  /** Secondary colour (pistil, ring core or crackle). */
  readonly accent: Rgb;
  /** Overall brightness (finale shells are a little brighter). */
  readonly brightness: number;
}

export interface FireworksShow {
  readonly shells: readonly Shell[];
  /** Show seconds until the last ember has faded. */
  readonly duration: number;
  readonly still: boolean;
}

/** Small deterministic PRNG (mulberry32). */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (random: () => number, min: number, max: number) => min + (max - min) * random();
const pick = <T>(random: () => number, list: readonly T[]): T => list[Math.floor(random() * list.length) % list.length]!;

/** Seconds a spark of each shell type lives after the burst (the longest). */
const SHELL_LIFE: Record<ShellType, number> = { peony: 2.6, chrysanthemum: 3.0, willow: 6.2, ring: 2.5, heart: 2.7, crackle: 3.3 };

/**
 * Where a rocket is `t` seconds into its flight: it decelerates like a
 * thrown ball (ease-out) and weaves a little.
 */
export function rocketPosition(shell: Shell, t: number): Vec3 {
  const u = Math.min(1, Math.max(0, t / shell.flight));
  const lift = 1 - (1 - u) * (1 - u);
  const weave = Math.sin(u * 9 + shell.launch * 3) * 0.12 * u;
  return [
    shell.base[0] + (shell.burst[0] - shell.base[0]) * lift + weave,
    shell.base[1] + (shell.burst[1] - shell.base[1]) * lift,
    shell.base[2] + (shell.burst[2] - shell.base[2]) * lift,
  ];
}

interface ShellPlacement {
  /** 0..1 across the burst lane (left to right); random when omitted. */
  readonly lane?: number;
  readonly finale?: boolean;
  readonly span?: readonly [number, number];
}

function makeShell(random: () => number, type: ShellType, launch: number, { lane, finale = false, span = BURST_X }: ShellPlacement = {}): Shell {
  const across = lane ?? random();
  const x = span[0] + (span[1] - span[0]) * Math.min(1, Math.max(0, across + range(random, -0.04, 0.04)));
  const z = range(random, -58, -44);
  const height = type === "willow" ? range(random, 13, 16) : range(random, 10, 15.5);
  const radius = type === "willow" ? range(random, 9, 11) : type === "ring" || type === "heart" ? range(random, 7, 8.5) : range(random, 7.5, 10);
  const [first, second] = pick(random, SHIFTS);
  const color = type === "willow" ? C.gold : type === "heart" ? pick(random, [C.rose, C.coral, C.violet]) : first;
  const fade = type === "willow" ? C.coral : type === "heart" ? C.rose : second;
  let accent = pick(random, PALETTE);
  if (accent === color) accent = C.white;
  if (type === "crackle") accent = C.white;
  return {
    type,
    launch,
    flight: range(random, 1.35, 1.8),
    base: [x + range(random, -2, 2), WATER_LEVEL, z + range(random, -2, 2)],
    burst: [x, height, z],
    radius,
    color,
    fade,
    accent,
    brightness: finale ? 1.05 : 1,
  };
}

/**
 * Builds a show from a seed. The animated show runs about 35 seconds: it
 * opens with single shells, builds to overlapping volleys of every shell type,
 * bursts into a finale of eight shells at once with a second wave, and ends
 * with willows whose golden embers fall gently. The still show (reduced
 * motion) is five bursts all open at `STILL_MOMENT`.
 */
export function buildFireworksShow(seed: number, options: { still?: boolean; narrow?: boolean } = {}): FireworksShow {
  const random = createRandom(seed);
  const span = options.narrow ? BURST_X_NARROW : BURST_X;
  const shells: Shell[] = [];
  if (options.still) {
    const types: ShellType[] = ["peony", "ring", "chrysanthemum", "heart", "willow"];
    types.forEach((type, i) => {
      const shell = makeShell(random, type, 0, { lane: i / (types.length - 1), span });
      const burst: Vec3 = [shell.burst[0], i % 2 === 0 ? range(random, 10, 12) : range(random, 13, 15), shell.burst[2]];
      shells.push({ ...shell, launch: STILL_MOMENT - 0.62 - shell.flight - i * 0.05, burst, base: [burst[0], WATER_LEVEL, burst[2]] });
    });
    return { shells, duration: Number.POSITIVE_INFINITY, still: true };
  }

  // Opening: single shells, unhurried, walking across the lake.
  let t = 0.5;
  (["peony", "chrysanthemum", "ring"] as const).forEach((type, i) => {
    shells.push(makeShell(random, type, t, { lane: [0.55, 0.2, 0.8][i], span }));
    t += range(random, 2.0, 2.3);
  });
  // Build: volleys that grow from pairs to quick fours, overlapping as they come.
  const volleys: ShellType[][] = [
    ["heart", "peony"],
    ["crackle", "chrysanthemum"],
    ["ring", "peony", "willow"],
    ["chrysanthemum", "heart"],
    ["crackle", "peony", "ring"],
    ["willow", "chrysanthemum", "heart"],
    ["peony", "crackle", "ring", "chrysanthemum"],
  ];
  volleys.forEach((volley, v) => {
    const spacing = v < 3 ? 0.45 : 0.3;
    volley.forEach((type, i) => shells.push(makeShell(random, type, t + i * spacing + range(random, 0, 0.1), { lane: (i + 0.5) / volley.length, span })));
    t += v < 3 ? range(random, 2.1, 2.4) : range(random, 1.7, 1.95);
  });
  // Finale: eight shells across the sky at once, then a second wave.
  t += 0.8;
  const finale: ShellType[] = ["chrysanthemum", "peony", "crackle", "ring", "heart", "peony", "crackle", "chrysanthemum"];
  finale.forEach((type, i) => shells.push(makeShell(random, type, t + range(random, 0, 0.5), { lane: (i + 0.5) / finale.length, finale: true, span })));
  const wave: ShellType[] = ["crackle", "peony", "chrysanthemum", "crackle"];
  wave.forEach((type, i) => shells.push(makeShell(random, type, t + 1.6 + range(random, 0, 0.35), { lane: (i + 0.5) / wave.length, finale: true, span })));
  // Coda: a willow canopy whose embers fall slowly over the water.
  [0.25, 0.75, 0.5].forEach((lane, i) => shells.push(makeShell(random, "willow", t + 3.4 + i * 0.35, { lane, finale: true, span })));

  const duration = Math.max(...shells.map((shell) => shell.launch + shell.flight + SHELL_LIFE[shell.type])) + 0.5;
  return { shells, duration, still: false };
}

/** Show seconds at which a shell bursts. */
export const burstTime = (shell: Shell) => shell.launch + shell.flight;

/** Unit vectors spread evenly over a sphere (Fibonacci lattice) with jitter. */
function sphere(random: () => number, count: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const offset = random() * Math.PI * 2;
  for (let i = 0; i < count; i += 1) {
    const y = 1 - ((i + 0.5) / count) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * golden + offset + (random() - 0.5) * 0.15;
    out.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return out;
}

function rotateToward(v: Vec3, tiltX: number, tiltY: number): Vec3 {
  // Tilt a shape authored in the x-y plane (facing the camera) a little.
  const cy = Math.cos(tiltY);
  const sy = Math.sin(tiltY);
  const cx = Math.cos(tiltX);
  const sx = Math.sin(tiltX);
  const x1 = v[0] * cy + v[2] * sy;
  const z1 = -v[0] * sy + v[2] * cy;
  return [x1, v[1] * cx - z1 * sx, v[1] * sx + z1 * cx];
}

/** Points on a heart outline in the x-y plane, scaled to a unit-ish radius. */
function heart(count: number): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    const x = 16 * Math.sin(a) ** 3;
    const y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
    out.push([x / 17, (y + 2) / 17, 0]);
  }
  return out;
}

export interface PackedFireworks {
  /** `SPARK_FLOATS` per particle. */
  readonly sparks: Float32Array<ArrayBuffer>;
  readonly sparkCount: number;
  /** `SHELL_FLOATS` per shell. */
  readonly shells: Float32Array<ArrayBuffer>;
  readonly shellCount: number;
}

interface SparkInput {
  origin: Vec3;
  spawn: number;
  velocity: Vec3;
  life: number;
  color: Rgb;
  size: number;
  kind: number;
  drag: number;
  trail: number;
  seed: number;
  gravity: number;
  /** 0..1 glitter: late twinkling flashes. */
  flicker: number;
  /** Colour the spark drifts toward as it burns. */
  fade: Rgb;
  /** Fraction of its life when the drift begins (> 1: never). */
  shift: number;
}

/** Packs a linear colour (0..1 per channel) into one float as 8 bits per channel (exact in f32). */
export function packColor(color: Rgb): number {
  const q = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return q(color[0]) * 65536 + q(color[1]) * 256 + q(color[2]);
}

/**
 * Packs a show into particle and shell records. Each shell gets one rocket,
 * a glittering launch trail and 150–400 burst stars; drag is chosen so stars
 * spread to about the shell's radius (speed ≈ radius × drag).
 */
export function packFireworks(show: FireworksShow, seed: number): PackedFireworks {
  const random = createRandom(seed ^ 0x9e3779b9);
  const sparks: SparkInput[] = [];
  const add = (spark: SparkInput) => {
    if (sparks.length < MAX_SPARKS) sparks.push(spark);
  };

  for (const shell of show.shells) {
    const burstAt = burstTime(shell);
    const b = shell.brightness;
    // The rocket: a hot head whose path is computed on the GPU from its base and burst point.
    add({ origin: shell.base, spawn: shell.launch, velocity: shell.burst, life: shell.flight, color: C.white, size: 0.08, kind: SPARK_KIND.rocket, drag: 0, trail: 0.16, seed: random(), gravity: 0, flicker: 0.4, fade: C.gold, shift: 2 });
    // Its glittering trail: sparks shed along the path, drifting down.
    const trailCount = 30;
    for (let i = 0; i < trailCount; i += 1) {
      const t = (i / trailCount) * shell.flight * 0.96;
      add({
        origin: rocketPosition(shell, t),
        spawn: shell.launch + t,
        velocity: [range(random, -0.35, 0.35), range(random, -0.9, -0.2), range(random, -0.35, 0.35)],
        life: range(random, 0.5, 1.0),
        color: C.gold,
        size: 0.045,
        kind: SPARK_KIND.trail,
        drag: 2.2,
        trail: 0.06,
        seed: random(),
        gravity: 0.5,
        flicker: 1,
        fade: C.coral,
        shift: 0.3,
      });
    }

    const star = (direction: Vec3, speed: number, options: Partial<SparkInput> & { life: number }) =>
      add({
        origin: shell.burst,
        spawn: burstAt + range(random, 0, 0.03),
        velocity: [direction[0] * speed, direction[1] * speed, direction[2] * speed],
        color: shell.color,
        size: 0.1 * b,
        kind: SPARK_KIND.star,
        drag: 1.7,
        trail: 0.1,
        seed: random(),
        gravity: 1,
        flicker: 0,
        fade: shell.fade,
        shift: range(random, 0.35, 0.55),
        ...options,
      });

    const r = shell.radius;
    switch (shell.type) {
      case "peony": {
        // Glitter on some stars: they twinkle as they fall.
        for (const d of sphere(random, 300)) star(d, r * 1.7 * range(random, 0.94, 1.06), { life: range(random, 1.8, 2.5), flicker: random() < 0.3 ? 1 : 0 });
        for (const d of sphere(random, 80)) star(d, r * 1.7 * 0.5, { life: range(random, 1.2, 1.8), color: shell.accent, fade: shell.accent, size: 0.075 * b });
        break;
      }
      case "chrysanthemum": {
        for (const d of sphere(random, 340))
          star(d, r * 1.5 * range(random, 0.93, 1.05), { life: range(random, 2.3, 2.95), drag: 1.5, kind: SPARK_KIND.comet, trail: 0.3, size: 0.075 * b, fade: C.gold });
        break;
      }
      case "willow": {
        for (const d of sphere(random, 280)) {
          const up: Vec3 = [d[0], d[1] * 0.75 + 0.25, d[2]];
          star(up, r * 1.25 * range(random, 0.9, 1.08), {
            life: range(random, 4.8, 6.1),
            drag: 1.25,
            kind: SPARK_KIND.willow,
            trail: 0.55,
            size: 0.06 * b,
            gravity: 0.58,
            color: C.gold,
            fade: C.coral,
            shift: 0.45,
            flicker: random() < 0.35 ? 1 : 0,
          });
        }
        break;
      }
      case "ring": {
        const tiltX = range(random, -0.45, 0.45);
        const tiltY = range(random, -0.55, 0.55);
        const count = 170;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2;
          star(rotateToward([Math.cos(a), Math.sin(a), 0], tiltX, tiltY), r * 1.7 * range(random, 0.98, 1.02), { life: range(random, 1.9, 2.4), gravity: 0.55 });
        }
        for (const d of sphere(random, 70)) star(d, r * 0.45, { life: range(random, 1.1, 1.6), color: shell.accent, fade: shell.accent, size: 0.07 * b });
        break;
      }
      case "heart": {
        const tiltY = range(random, -0.3, 0.3);
        for (const p of heart(190)) {
          const length = Math.hypot(p[0], p[1]) || 1;
          star(rotateToward([p[0] / length, p[1] / length, 0], 0.05, tiltY), r * 1.75 * length * range(random, 0.985, 1.015), { life: range(random, 2.0, 2.6), gravity: 0.38, drag: 1.8 });
        }
        for (const d of sphere(random, 40)) star(d, r * 0.4, { life: range(random, 1.2, 1.6), color: C.white, fade: C.rose, size: 0.06 * b, flicker: 1 });
        break;
      }
      case "crackle": {
        for (const d of sphere(random, 300))
          star(d, r * 1.6 * range(random, 0.9, 1.06), { life: range(random, 2.5, 3.2), kind: SPARK_KIND.crackle, color: shell.color, fade: C.white, flicker: 1, trail: 0.07 });
        for (const d of sphere(random, 60)) star(d, r * 1.6 * 0.55, { life: range(random, 1.3, 1.9), color: shell.accent, fade: shell.accent, size: 0.075 * b });
        break;
      }
    }
  }

  const sparkData = new Float32Array(Math.max(1, sparks.length) * SPARK_FLOATS);
  sparks.forEach((s, i) => {
    sparkData.set(
      [...s.origin, s.spawn, ...s.velocity, s.life, ...s.color, s.size, s.kind, s.drag, s.trail, s.seed, s.gravity, s.flicker, packColor(s.fade), s.shift],
      i * SPARK_FLOATS,
    );
  });
  const shellCount = Math.min(show.shells.length, MAX_SHELLS);
  const shellData = new Float32Array(Math.max(1, shellCount) * SHELL_FLOATS);
  show.shells.slice(0, shellCount).forEach((shell, i) => {
    shellData.set([...shell.burst, burstTime(shell), ...shell.color, shell.radius, shell.brightness, shell.type === "willow" ? 1 : 0, packColor(shell.fade), 0], i * SHELL_FLOATS);
  });
  return { sparks: sparkData, sparkCount: sparks.length, shells: shellData, shellCount };
}

/** Brightness of a shell's flash `age` seconds after it bursts (0 before). */
export function flashAt(age: number): number {
  if (age < 0) return 0;
  return Math.exp(-age * 2.6) + 0.22 * Math.exp(-age * 0.55);
}

export interface FireworksLight {
  readonly position: Vec3;
  readonly color: readonly [number, number, number];
  readonly level: number;
}

/**
 * The light the open bursts throw on the scene at show time `t`: their
 * flash-weighted colour from their flash-weighted centre.
 */
export function fireworksLightAt(show: FireworksShow, t: number): FireworksLight | null {
  let weight = 0;
  const position: [number, number, number] = [0, 0, 0];
  const color: [number, number, number] = [0, 0, 0];
  for (const shell of show.shells) {
    const age = t - burstTime(shell);
    if (age < 0 || age > 7) continue;
    const w = flashAt(age) * shell.brightness * (shell.type === "willow" ? 0.7 : 1);
    weight += w;
    for (let k = 0; k < 3; k += 1) {
      position[k]! += shell.burst[k]! * w;
      color[k]! += (shell.color[k]! * 0.8 + 0.2) * w;
    }
  }
  if (weight < 1e-3) return null;
  return {
    position: [position[0] / weight, position[1] / weight, position[2] / weight],
    color: [color[0] / weight, color[1] / weight, color[2] / weight],
    level: Math.min(2, weight),
  };
}

/**
 * How far the moon and sky recede at show time `t` (0..1): eased in over the
 * first seconds and out as the last embers fade. The still sky holds it.
 */
export function showDimAt(show: FireworksShow, t: number): number {
  if (show.still) return 1;
  const ease = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c * c * (3 - 2 * c);
  };
  return ease(t / 1.5) * ease((show.duration - t) / 3);
}
