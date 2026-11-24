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

/** Floats per particle record (`Spark` in fireworks.wgsl). */
export const SPARK_FLOATS = 20;
/** Floats per shell record (`Shell` in fireworks.wgsl). */
export const SHELL_FLOATS = 12;
/** Upper bound of particles in one show (GPU pool size). */
export const MAX_SPARKS = 16_384;
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

/** Painterly firework colours (linear-light, before HDR intensity). */
const PALETTE: readonly (readonly [number, number, number])[] = [
  [1.0, 0.36, 0.42], // rose
  [1.0, 0.66, 0.22], // saffron
  [1.0, 0.86, 0.58], // warm white-gold
  [0.95, 0.22, 0.2], // coral red
  [0.72, 0.5, 1.0], // lilac
  [0.36, 0.86, 0.9], // soft teal
  [0.55, 0.95, 0.45], // spring green
  [1.0, 0.5, 0.72], // pink
  [0.45, 0.62, 1.0], // cornflower
];
const GOLD: readonly [number, number, number] = [1.0, 0.7, 0.3];
const WHITE_GOLD: readonly [number, number, number] = [1.0, 0.88, 0.64];

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
  readonly color: readonly [number, number, number];
  /** Secondary colour (pistil, ring core or crackle). */
  readonly accent: readonly [number, number, number];
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
const SHELL_LIFE: Record<ShellType, number> = { peony: 2.5, chrysanthemum: 2.9, willow: 5.6, ring: 2.4, heart: 2.6, crackle: 3.2 };

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

function makeShell(random: () => number, type: ShellType, launch: number, finale: boolean): Shell {
  const x = range(random, -26, 26);
  const z = range(random, -58, -42);
  const height = range(random, 10, 15.5);
  const radius = type === "willow" ? range(random, 8.5, 10.5) : type === "ring" || type === "heart" ? range(random, 6.5, 8) : range(random, 7, 9.5);
  const color = type === "willow" ? GOLD : type === "heart" ? pick(random, [PALETTE[0]!, PALETTE[3]!, PALETTE[7]!]) : pick(random, PALETTE);
  let accent = pick(random, PALETTE);
  if (accent === color) accent = WHITE_GOLD;
  if (type === "crackle") accent = WHITE_GOLD;
  return {
    type,
    launch,
    flight: range(random, 1.35, 1.85),
    base: [x + range(random, -2, 2), WATER_LEVEL, z + range(random, -2, 2)],
    burst: [x, height, z],
    radius,
    color,
    accent,
    brightness: finale ? 1.15 : 1,
  };
}

/**
 * Builds a show from a seed. The animated show runs about half a minute: an
 * opening of single shells, a middle of pairs with every shell type (rings
 * and hearts among them), and a quick finale salvo under a willow canopy.
 * The still show (reduced motion) is five bursts all open at `STILL_MOMENT`.
 */
export function buildFireworksShow(seed: number, options: { still?: boolean } = {}): FireworksShow {
  const random = createRandom(seed);
  const shells: Shell[] = [];
  if (options.still) {
    const types: ShellType[] = ["peony", "ring", "chrysanthemum", "heart", "willow"];
    types.forEach((type, i) => {
      const shell = makeShell(random, type, 0, false);
      // Spread them across the sky so none hides another.
      const x = -22 + i * 11 + range(random, -1.5, 1.5);
      const burst: Vec3 = [x, i % 2 === 0 ? range(random, 10, 12) : range(random, 13, 15), shell.burst[2]];
      shells.push({ ...shell, launch: STILL_MOMENT - 0.62 - shell.flight - i * 0.05, burst, base: [x, WATER_LEVEL, burst[2]] });
    });
    return { shells, duration: Number.POSITIVE_INFINITY, still: true };
  }

  // Opening: single shells, unhurried.
  let t = 0.6;
  for (const type of ["peony", "chrysanthemum", "ring"] as const) {
    shells.push(makeShell(random, type, t, false));
    t += range(random, 1.9, 2.4);
  }
  // Middle: pairs and singles cycling through every type.
  const middle: ShellType[] = ["heart", "willow", "crackle", "peony", "ring", "chrysanthemum", "heart", "peony", "crackle", "willow", "ring", "peony"];
  for (let i = 0; i < middle.length; i += 1) {
    shells.push(makeShell(random, middle[i]!, t, false));
    if (i % 3 === 1) shells.push(makeShell(random, pick(random, ["peony", "chrysanthemum", "ring"] as const), t + range(random, 0.25, 0.55), false));
    t += range(random, 1.05, 1.55);
  }
  // Finale: a willow canopy, then a quick salvo with crackle.
  t += 0.6;
  shells.push(makeShell(random, "willow", t, true), makeShell(random, "willow", t + 0.2, true));
  const finale: ShellType[] = ["chrysanthemum", "crackle", "peony", "ring", "heart", "crackle", "chrysanthemum", "peony", "crackle"];
  finale.forEach((type, i) => shells.push(makeShell(random, type, t + 0.9 + i * range(random, 0.22, 0.34), true)));

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
  color: readonly [number, number, number];
  size: number;
  kind: number;
  drag: number;
  trail: number;
  seed: number;
  gravity: number;
  flicker: number;
}

/**
 * Packs a show into particle and shell records. Each shell gets one rocket,
 * a glittering launch trail and its burst stars; drag is chosen so stars
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
    add({ origin: shell.base, spawn: shell.launch, velocity: shell.burst, life: shell.flight, color: WHITE_GOLD, size: 0.07, kind: SPARK_KIND.rocket, drag: 0, trail: 0.14, seed: random(), gravity: 0, flicker: 0.4 });
    // Its glittering trail: sparks shed along the path, drifting down.
    const trailCount = 26;
    for (let i = 0; i < trailCount; i += 1) {
      const t = (i / trailCount) * shell.flight * 0.96;
      add({
        origin: rocketPosition(shell, t),
        spawn: shell.launch + t,
        velocity: [range(random, -0.35, 0.35), range(random, -0.9, -0.2), range(random, -0.35, 0.35)],
        life: range(random, 0.45, 0.9),
        color: GOLD,
        size: 0.035,
        kind: SPARK_KIND.trail,
        drag: 2.2,
        trail: 0.05,
        seed: random(),
        gravity: 0.5,
        flicker: 1,
      });
    }

    const star = (direction: Vec3, speed: number, options: Partial<SparkInput> & { life: number }) =>
      add({
        origin: shell.burst,
        spawn: burstAt + range(random, 0, 0.03),
        velocity: [direction[0] * speed, direction[1] * speed, direction[2] * speed],
        color: shell.color,
        size: 0.09 * b,
        kind: SPARK_KIND.star,
        drag: 1.7,
        trail: 0.08,
        seed: random(),
        gravity: 1,
        flicker: 0,
        ...options,
      });

    const r = shell.radius;
    switch (shell.type) {
      case "peony": {
        for (const d of sphere(random, 220)) star(d, r * 1.7 * range(random, 0.94, 1.06), { life: range(random, 1.7, 2.4) });
        for (const d of sphere(random, 60)) star(d, r * 1.7 * 0.5, { life: range(random, 1.2, 1.7), color: shell.accent, size: 0.06 * b });
        break;
      }
      case "chrysanthemum": {
        for (const d of sphere(random, 240))
          star(d, r * 1.5 * range(random, 0.93, 1.05), { life: range(random, 2.2, 2.85), drag: 1.5, kind: SPARK_KIND.comet, trail: 0.24, size: 0.06 * b });
        break;
      }
      case "willow": {
        for (const d of sphere(random, 190)) {
          const up: Vec3 = [d[0], d[1] * 0.75 + 0.25, d[2]];
          star(up, r * 1.25 * range(random, 0.9, 1.08), { life: range(random, 4.4, 5.5), drag: 1.25, kind: SPARK_KIND.willow, trail: 0.5, size: 0.05 * b, gravity: 0.62, color: GOLD });
        }
        break;
      }
      case "ring": {
        const tiltX = range(random, -0.5, 0.5);
        const tiltY = range(random, -0.6, 0.6);
        const count = 110;
        for (let i = 0; i < count; i += 1) {
          const a = (i / count) * Math.PI * 2;
          star(rotateToward([Math.cos(a), Math.sin(a), 0], tiltX, tiltY), r * 1.7, { life: range(random, 1.8, 2.3), gravity: 0.55 });
        }
        for (const d of sphere(random, 40)) star(d, r * 0.45, { life: range(random, 1.1, 1.5), color: shell.accent, size: 0.055 * b });
        break;
      }
      case "heart": {
        const tiltY = range(random, -0.35, 0.35);
        for (const p of heart(130)) {
          const length = Math.hypot(p[0], p[1]) || 1;
          star(rotateToward([p[0] / length, p[1] / length, 0], 0.05, tiltY), r * 1.75 * length, { life: range(random, 1.9, 2.5), gravity: 0.4, drag: 1.8 });
        }
        break;
      }
      case "crackle": {
        for (const d of sphere(random, 200))
          star(d, r * 1.6 * range(random, 0.9, 1.06), { life: range(random, 2.4, 3.1), kind: SPARK_KIND.crackle, color: shell.accent, flicker: 1, trail: 0.06 });
        for (const d of sphere(random, 50)) star(d, r * 1.6 * 0.55, { life: range(random, 1.3, 1.8), color: shell.color, size: 0.06 * b });
        break;
      }
    }
  }

  const sparkData = new Float32Array(Math.max(1, sparks.length) * SPARK_FLOATS);
  sparks.forEach((s, i) => {
    sparkData.set(
      [...s.origin, s.spawn, ...s.velocity, s.life, ...s.color, s.size, s.kind, s.drag, s.trail, s.seed, s.gravity, s.flicker, 0, 0],
      i * SPARK_FLOATS,
    );
  });
  const shellCount = Math.min(show.shells.length, MAX_SHELLS);
  const shellData = new Float32Array(Math.max(1, shellCount) * SHELL_FLOATS);
  show.shells.slice(0, shellCount).forEach((shell, i) => {
    shellData.set([...shell.burst, burstTime(shell), ...shell.color, shell.radius, shell.brightness, shell.type === "willow" ? 1 : 0, 0, 0], i * SHELL_FLOATS);
  });
  return { sparks: sparkData, sparkCount: sparks.length, shells: shellData, shellCount };
}

/** Brightness of a shell's flash `age` seconds after it bursts (0 before). */
export function flashAt(age: number): number {
  if (age < 0) return 0;
  return Math.exp(-age * 2.4) + 0.18 * Math.exp(-age * 0.7);
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
    if (age < 0 || age > 6) continue;
    const w = flashAt(age) * shell.brightness * (shell.type === "willow" ? 0.7 : 1);
    weight += w;
    for (let k = 0; k < 3; k += 1) {
      position[k]! += shell.burst[k]! * w;
      color[k]! += (shell.color[k]! * 0.7 + 0.3) * w;
    }
  }
  if (weight < 1e-3) return null;
  return {
    position: [position[0] / weight, position[1] / weight, position[2] / weight],
    color: [color[0] / weight, color[1] / weight, color[2] / weight],
    level: Math.min(1.6, weight),
  };
}
