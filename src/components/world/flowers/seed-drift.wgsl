// A dandelion's seeds blowing away (#201): each seed is drawn exactly like the
// puff paints it (the same achene, beak and pappus templates, bristle paint and
// light as flower.wgsl), moved by its simulated pose. Before letting go it
// sways with its plant. Translucent, so seeds fade into the sky; drifting seeds
// catch a little extra light and glow softly through the bloom.
import { World, aerial, distanceAlpha, shadowFactor, valueNoise } from "../shaders/common.wgsl";
import { TAU, blobSurface, sway, tubeSurface } from "./flower-core.wgsl";
import { DriftSeed, DriftState, MODE_OFF, qrotate } from "./seed-drift-common.wgsl";

struct DriftView {
  // Wind sway of attached seeds (matches the flowers' own sway).
  sway: f32,
  // Seeds nearer than this keep their botanical detail through the painterly filter.
  detailNear: f32,
  // Extra glow of drifting seeds.
  glow: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(0) @binding(3) var<storage, read> seeds: array<DriftSeed>;
@group(0) @binding(4) var<storage, read> states: array<DriftState>;
@group(0) @binding(5) var<uniform> drift: DriftView;

const PART_ACHENE: u32 = 0u;
const PART_BEAK: u32 = 1u;

struct SeedOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec3f,
  @location(2) normal: vec3f,
  // rgb, part (0 achene, 1 beak, 2 pappus)
  @location(3) @interpolate(flat) base: vec4f,
  // rgb, translucency
  @location(4) @interpolate(flat) tip: vec4f,
  // part seed, self glow, opacity, seconds aloft
  @location(5) @interpolate(flat) misc: vec4f,
}

fn hidden() -> SeedOut {
  var out: SeedOut;
  out.clip = vec4f(2.0, 2.0, 2.0, 1.0);
  return out;
}

struct SeedIn {
  @location(0) grid: vec2f,
  @builtin(instance_index) instance: u32,
}

@vertex fn vs_main(input: SeedIn) -> SeedOut {
  let grid = input.grid;
  let index = input.instance / 3u;
  let part = input.instance % 3u;
  let s = seeds[index];
  let st = states[index];
  if (abs(s.motion.w - MODE_OFF) < 0.5 || st.position.w != s.pivot.w || st.spin.w <= 0.003) {
    return hidden();
  }
  let pivot = s.pivot.xyz;
  let axis = normalize(s.axis.xyz);
  let front = normalize(s.front.xyz);
  var position: vec3f;
  var normal: vec3f;
  var base: vec4f;
  var tip: vec4f;
  var partSeed: f32;
  var glow = 0.0;
  if (part == PART_ACHENE) {
    let surface = blobSurface(grid.x, grid.y, vec4f(pivot + axis * s.acheneShape.w, s.acheneShape.x), vec4f(axis, s.acheneShape.y), vec4f(front, s.acheneShape.z), vec4f(0.0), s.acheneBase.w);
    position = surface.position;
    normal = surface.normal;
    base = vec4f(s.acheneBase.rgb, 0.0);
    tip = vec4f(s.acheneTip.rgb, s.pappusTip.w);
    partSeed = s.acheneBase.w;
  } else if (part == PART_BEAK) {
    let foot = pivot + axis * s.acheneTip.w;
    let reach = pivot - foot;
    let surface = tubeSurface(grid.x, grid.y, vec4f(foot, s.beakShape.x), vec4f(foot + reach / 3.0, s.beakShape.y), vec4f(foot + reach * (2.0 / 3.0), 0.0), vec4f(pivot, 0.0));
    position = surface.position;
    normal = surface.normal;
    base = vec4f(s.beakBase.rgb, 1.0);
    tip = vec4f(s.beakTip.rgb, 0.85);
    partSeed = s.beakShape.z;
  } else {
    let surface = blobSurface(grid.x, grid.y, vec4f(pivot, s.pappusShape.x), vec4f(axis, s.pappusShape.y), vec4f(front, s.pappusShape.z), vec4f(0.0), s.beakShape.w);
    position = surface.position;
    normal = surface.normal;
    base = vec4f(s.pappusBase.rgb, 2.0);
    tip = vec4f(s.pappusTip.rgb, s.beakBase.w);
    partSeed = s.beakShape.w;
    glow = s.beakTip.w;
  }
  // Carried by its simulated pose; while attached it sways with its plant,
  // letting go of that sway over its first moments aloft.
  let aloft = st.velocity.w;
  let attached = select(1.0 - smoothstep(0.0, 0.6, aloft), 1.0, aloft < 0.0);
  let p = st.position.xyz + qrotate(st.rotation, position - pivot) + sway(position, s.anchor, s.motion.x, world.time, drift.sway) * attached;
  var out: SeedOut;
  out.clip = world.viewProjection * vec4f(p, 1.0);
  out.uv = grid;
  out.worldPos = p;
  out.normal = qrotate(st.rotation, normal);
  out.base = base;
  out.tip = tip;
  out.misc = vec4f(partSeed, glow, st.spin.w, max(aloft, 0.0));
  return out;
}

fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

struct Paint {
  albedo: vec3f,
  thin: f32,
  gloss: f32,
  ao: f32,
}

// The puff's own paint (flower.wgsl: pappus, disk and filament).
fn paint(input: SeedOut) -> Paint {
  let part = input.base.w;
  let seed = input.misc.x;
  let t = input.uv.x;
  var p: Paint;
  p.ao = 1.0;
  if (part > 1.5) {
    // An umbrella of fine bristles radiating from the seed's tip.
    if (t > 0.5) {
      discard;
    }
    let fibre = abs(fract(input.uv.y * 30.0 + valueNoise(vec2f(t * 6.0, seed * 9.0)) * 0.5) - 0.5) * 2.0;
    let keep = select(0.22, 0.6, t < 0.08);
    if (fibre > keep || valueNoise(vec2f(input.uv.y * 90.0, t * 30.0 + seed * 4.0)) > 0.8) {
      discard;
    }
    p.albedo = mix(input.base.rgb, input.tip.rgb, t * 2.0);
    p.thin = 0.95;
    p.gloss = 0.2;
    return p;
  }
  if (part > 0.5) {
    let fibre = valueNoise(vec2f(input.uv.y * 26.0 + seed * 11.0, t * 5.0)) - 0.5;
    p.albedo = mix(input.base.rgb, input.tip.rgb, t) * (1.0 + fibre * 0.1);
    p.thin = 0.85;
    p.gloss = 0.3;
    return p;
  }
  let grain = valueNoise(vec2f(t * 30.0 + seed * 3.0, input.uv.y * 40.0));
  p.albedo = mix(input.base.rgb, input.tip.rgb, clamp((1.0 - t) * 0.8 - 0.2 + (grain - 0.5) * 0.5, 0.0, 1.0));
  p.thin = 0.15;
  p.gloss = 0.3;
  p.ao = mix(1.0, 0.65, smoothstep(0.5, 1.0, t));
  return p;
}

// The flowers' light (flower.wgsl fs_main), so a seed looks the same attached or aloft.
fn shade(input: SeedOut) -> vec3f {
  let p = paint(input);
  let toEye = normalize(world.eye - input.worldPos);
  var n = normalize(input.normal);
  if (dot(n, toEye) < 0.0) {
    n = -n;
  }
  let albedo = p.albedo;
  let light = normalize(world.lightDir);
  let ndl = dot(n, light);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, input.worldPos, n);
  let direct = smoothstep(-0.3, 0.85, ndl) * shadow;
  let key = world.lightColor * world.lightIntensity;
  let skyFill = world.ambient * (0.55 + 0.3 * n.y);
  var lit = albedo * (skyFill * p.ao + key * direct * mix(0.75, 1.0, p.ao));
  let through = max(-ndl, 0.0);
  let forward = pow(max(dot(-toEye, light), 0.0), 3.0);
  let transmit = albedo * (albedo * 1.3 + vec3f(0.12)) * (1.0 - 0.45 * smoothstep(0.35, 0.8, luma(albedo)));
  lit += key * transmit * p.thin * (through * 0.5 + forward * 0.7) * (0.35 + 0.65 * shadow);
  lit += key * albedo * albedo * p.thin * 0.28 * (1.0 - 0.7 * direct);
  let rim = pow(1.0 - max(dot(n, toEye), 0.0), 3.0);
  lit += key * albedo * rim * (0.25 + 0.6 * max(dot(-toEye, light), 0.0)) * (0.4 + 0.6 * shadow);
  let h = normalize(light + toEye);
  lit += key * pow(max(dot(n, h), 0.0), 18.0 + p.gloss * 70.0) * p.gloss * 0.45 * shadow;
  lit += albedo * (0.05 * (1.0 - 0.7 * world.night) + input.misc.y * (0.12 + world.night * 1.15));
  // Aloft, the seeds catch the light: a soft wish-glow that blooms in the sky.
  let aloft = smoothstep(0.0, 1.4, input.misc.w);
  lit += albedo * drift.glow * aloft * (0.6 + 0.4 * (1.0 - world.night) + world.night * 0.6);
  return aerial(lit, input.worldPos, world);
}

// Colour, blended by the seed's opacity (alpha is kept for the painterly filter).
@fragment fn fs_main(input: SeedOut) -> @location(0) vec4f {
  return vec4f(shade(input), input.misc.z);
}

// Into the alpha channel only: the seeds' pixels keep their detail through
// the painterly filter while they are near and still mostly opaque.
@fragment fn fs_detail(input: SeedOut) -> @location(0) vec4f {
  // The same bristles as the colour (paint discards between them).
  _ = paint(input);
  let near = length(input.worldPos - world.eye) < drift.detailNear;
  if (input.misc.z < 0.35) {
    discard;
  }
  return vec4f(0.0, 0.0, 0.0, select(distanceAlpha(input.worldPos, world), -1.0, near));
}
