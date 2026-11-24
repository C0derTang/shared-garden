import { sunDirection, type SkyState } from "./solar";

export type Rgb = readonly [number, number, number];

/** Everything the painted world needs to light itself for one sky state. */
export interface WorldLighting {
  /** Linear-light colors. */
  readonly zenith: Rgb;
  readonly horizon: Rgb;
  readonly lightColor: Rgb;
  readonly ambient: Rgb;
  readonly fog: Rgb;
  /** Key light strength (sun by day, moon by night). */
  readonly lightIntensity: number;
  /** Unit direction toward the key light (world space). */
  readonly lightDirection: [number, number, number];
  /** Unit direction toward the sun, even below the horizon. */
  readonly sunDirection: [number, number, number];
  /** Unit direction toward the moon. */
  readonly moonDirection: [number, number, number];
  /** 0 in daylight, 1 in full night. */
  readonly night: number;
  /** 0..1 visibility of stars. */
  readonly stars: number;
  /** 0..1 warmth of the low sun (golden hour / twilight glow). */
  readonly glow: number;
}

interface Key {
  readonly elevation: number;
  readonly zenith: string;
  readonly horizonDawn: string;
  readonly horizonDusk: string;
  readonly lightDawn: string;
  readonly lightDusk: string;
  readonly ambient: string;
  readonly intensity: number;
}

// Hand-picked gouache palette, keyed by solar elevation (degrees).
const KEYS: readonly Key[] = [
  { elevation: -18, zenith: "#12204a", horizonDawn: "#2c3d70", horizonDusk: "#2a3a6c", lightDawn: "#a4b6ea", lightDusk: "#a4b6ea", ambient: "#2b3c6a", intensity: 0.5 },
  { elevation: -6, zenith: "#243566", horizonDawn: "#c08ba6", horizonDusk: "#b46f8c", lightDawn: "#b4a3d6", lightDusk: "#b897c8", ambient: "#3b3f68", intensity: 0.32 },
  { elevation: 0, zenith: "#8a86a6", horizonDawn: "#f6b99d", horizonDusk: "#f39a6b", lightDawn: "#ffb68e", lightDusk: "#ffa25e", ambient: "#8c7f86", intensity: 1.0 },
  { elevation: 8, zenith: "#7ea3d6", horizonDawn: "#f8d9b0", horizonDusk: "#f7c995", lightDawn: "#ffd6a6", lightDusk: "#ffc98c", ambient: "#a49d98", intensity: 1.15 },
  { elevation: 25, zenith: "#7fa8de", horizonDawn: "#bdd3e4", horizonDusk: "#c6d6df", lightDawn: "#fff1d8", lightDusk: "#ffeccc", ambient: "#a5bed6", intensity: 1.2 },
  { elevation: 60, zenith: "#6e9fe0", horizonDawn: "#bfd5e8", horizonDusk: "#bfd5e8", lightDawn: "#fff6e8", lightDusk: "#fff6e8", ambient: "#b0c7dc", intensity: 1.25 },
];

/** sRGB hex to linear-light RGB. */
export function hexToLinear(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = ((value >> shift) & 0xff) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(16), channel(8), channel(0)];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalize(v: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/** Continuous lighting for a sky state; neighbouring instants blend smoothly. */
export function worldLightingFor(sky: SkyState): WorldLighting {
  const elevation = Math.min(KEYS[KEYS.length - 1]!.elevation, Math.max(KEYS[0]!.elevation, sky.elevation));
  let index = 0;
  while (index < KEYS.length - 2 && elevation > KEYS[index + 1]!.elevation) index += 1;
  const a = KEYS[index]!;
  const b = KEYS[index + 1]!;
  const t = smoothstep(a.elevation, b.elevation, elevation);
  const pick = (key: Key, field: "horizon" | "light") =>
    hexToLinear(sky.morning ? key[`${field}Dawn`] : key[`${field}Dusk`]);

  const zenith = mix(hexToLinear(a.zenith), hexToLinear(b.zenith), t);
  const horizon = mix(pick(a, "horizon"), pick(b, "horizon"), t);
  const lightColor = mix(pick(a, "light"), pick(b, "light"), t);
  const ambient = mix(hexToLinear(a.ambient), hexToLinear(b.ambient), t);
  const lightIntensity = a.intensity + (b.intensity - a.intensity) * t;

  const night = smoothstep(-1, -10, sky.elevation);
  const stars = smoothstep(-4, -12, sky.elevation);
  const glow = smoothstep(-8, 0, sky.elevation) * (1 - smoothstep(6, 20, sky.elevation));

  const sun = sunDirection(sky);
  // Twilight keeps a grazing key light just above the horizon.
  const sunLight = sunDirection({ azimuth: sky.azimuth, elevation: Math.max(sky.elevation, 4) });
  // The moon is an artistic companion hung over the lake (west-southwest), not an ephemeris.
  const moon = sunDirection({ azimuth: 256, elevation: 13 });
  const lightDirection = normalize([
    sunLight[0] + (moon[0] - sunLight[0]) * night,
    sunLight[1] + (moon[1] - sunLight[1]) * night,
    sunLight[2] + (moon[2] - sunLight[2]) * night,
  ]);

  return {
    zenith,
    horizon,
    lightColor,
    ambient,
    fog: mix(horizon, ambient, 0.3),
    lightIntensity,
    lightDirection,
    sunDirection: sun,
    moonDirection: moon,
    night,
    stars,
    glow,
  };
}
