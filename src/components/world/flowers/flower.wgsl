// Lit procedural flowers: botanical petals, leaves, stalks, stamens and seed
// heads painted with brushy tonal streaks, translucent when backlit, with a
// rim of light and a soft glow. One module, three template entry points.
import { World, aerial, distanceAlpha, shadowFactor, valueNoise } from "../shaders/common.wgsl";
import { FlowerParams, TAU, blobSurface, sheetSurface, sheetU, sway, tubeSurface } from "./flower-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;
@group(0) @binding(3) var<uniform> flowers: FlowerParams;

const M_PETAL: f32 = 0.0;
const M_LEAF: f32 = 1.0;
const M_STEM: f32 = 2.0;
const M_FILAMENT: f32 = 3.0;
const M_ANTHER: f32 = 4.0;
const M_DISK: f32 = 5.0;
const M_CACTUS: f32 = 6.0;
const M_SPINE: f32 = 7.0;
const M_PAPPUS: f32 = 8.0;

const T_SHEET: f32 = 0.0;
const T_TUBE: f32 = 1.0;
const T_BLOB: f32 = 2.0;

struct PartIn {
  @location(0) grid: vec2f,
  @location(1) i0: vec4f,
  @location(2) i1: vec4f,
  @location(3) i2: vec4f,
  @location(4) i3: vec4f,
  @location(5) i4: vec4f,
  @location(6) i5: vec4f,
  @location(7) i6: vec4f,
  @location(8) c0: vec4f,
  @location(9) c1: vec4f,
  @location(10) c2: vec4f,
  @location(11) anchor: vec4f,
}

struct FlowerOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) worldPos: vec3f,
  @location(2) normal: vec3f,
  // rgb, material
  @location(3) @interpolate(flat) base: vec4f,
  // rgb, translucency
  @location(4) @interpolate(flat) tip: vec4f,
  // rgb, vein strength
  @location(5) @interpolate(flat) accent: vec4f,
  // flower index, seed, glow, kind
  @location(6) @interpolate(flat) misc: vec4f,
  // sheet: notch, teeth, tooth depth, colour blend; blob: ribs, rib depth, bumps
  @location(7) @interpolate(flat) cut: vec4f,
}

fn finish(input: PartIn, position: vec3f, normal: vec3f, uv: vec2f, kind: f32, cut: vec4f) -> FlowerOut {
  let p = position + sway(position, input.anchor, input.i5.y, world.time, flowers.sway);
  var out: FlowerOut;
  out.clip = world.viewProjection * vec4f(p, 1.0);
  out.uv = uv;
  out.worldPos = p;
  out.normal = normal;
  out.base = input.c0;
  out.tip = input.c1;
  out.accent = input.c2;
  out.misc = vec4f(input.i5.x, input.i5.z, input.i5.w, kind);
  out.cut = cut;
  return out;
}

@vertex fn vs_sheet(input: PartIn) -> FlowerOut {
  let u = sheetU(input.grid.x);
  let v = input.grid.y * 2.0 - 1.0;
  let s = sheetSurface(u, v, input.i0, input.i1, input.i2, input.i3, input.i4, input.i6, input.i5.z);
  return finish(input, s.position, s.normal, vec2f(u, v), T_SHEET, vec4f(input.i4.w, input.i6.x, input.i6.y, input.i6.w));
}

@vertex fn vs_tube(input: PartIn) -> FlowerOut {
  let s = tubeSurface(input.grid.x, input.grid.y, input.i0, input.i1, input.i2, input.i3);
  return finish(input, s.position, s.normal, input.grid, T_TUBE, vec4f(0.0));
}

@vertex fn vs_blob(input: PartIn) -> FlowerOut {
  let s = blobSurface(input.grid.x, input.grid.y, input.i0, input.i1, input.i2, input.i3, input.i5.z);
  return finish(input, s.position, s.normal, input.grid, T_BLOB, vec4f(input.i3.x, input.i3.y, input.i3.w, 0.0));
}

fn isM(material: f32, wanted: f32) -> bool {
  return abs(material - wanted) < 0.5;
}

fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}

struct Paint {
  albedo: vec3f,
  // Light let through when backlit.
  thin: f32,
  // Specular strength.
  gloss: f32,
  // Ambient occlusion.
  ao: f32,
  // 0..1 share of the pixel covered (anti-aliased margins).
  cover: f32,
}

// Brushstroke tonal streaks along a blade: long pigment streaks plus fine bristles.
fn brushStreaks(u: f32, v: f32, seed: f32) -> vec2f {
  let streak = valueNoise(vec2f(v * 9.0 + seed * 31.0, u * 1.4 + seed * 3.0)) * 0.6 + valueNoise(vec2f(v * 21.0 + seed * 7.0, u * 2.2)) * 0.4;
  let bristle = valueNoise(vec2f(v * 60.0 + seed * 13.0, u * 3.5 + seed));
  return vec2f(streak - 0.5, bristle - 0.5);
}

// `d` is fwidth(uv): how much of the blade one pixel spans, for anti-aliased
// margins and for detail that appears as the petal grows on screen.
fn paintSheet(input: FlowerOut, material: f32, seed: f32, d: vec2f) -> Paint {
  let u = input.uv.x;
  let v = input.uv.y;
  let av = abs(v);
  let px = max(d, vec2f(1e-4));

  // Ragged, brushy margin.
  let rag = valueNoise(vec2f(u * 14.0 + seed * 91.0, seed * 7.0)) * 0.03 + valueNoise(vec2f(u * 60.0 + seed * 13.0, 3.0 + seed)) * 0.012;
  var limit = 1.0 - rag;
  let teeth = input.cut.y;
  if (teeth > 0.5) {
    var depth = input.cut.z * smoothstep(0.03, 0.16, u) * (1.0 - smoothstep(0.9, 1.0, u));
    if (isM(material, M_PETAL)) {
      depth *= smoothstep(0.5, 0.75, u);
    }
    let saw = fract(u * teeth + seed);
    // Serrations point to the tip; deep (runcinate) lobes point back to the base.
    let profile = select(1.0 - saw, saw, input.cut.z > 0.4);
    limit -= depth * profile;
  }
  // Coverage instead of a hard cut, so margins stay smooth at any distance.
  var cover = clamp((limit - av) / px.y + 0.5, 0.0, 1.0);
  let notch = input.cut.x;
  if (notch > 0.0) {
    let notchEdge = 1.0 - notch * (1.0 - smoothstep(0.0, 0.28, av));
    cover = min(cover, clamp((notchEdge - u) / px.x + 0.5, 0.0, 1.0));
  }
  if (cover <= 0.0) {
    discard;
  }

  let brush = brushStreaks(u, v, seed);
  var p: Paint;
  if (isM(material, M_LEAF)) {
    var col = mix(input.base.rgb, input.tip.rgb, clamp(u * 0.55 + brush.x * 0.5 + 0.1, 0.0, 1.0));
    let mid = (1.0 - smoothstep(0.0, 0.05 + 0.04 * (1.0 - u), av)) * (1.0 - smoothstep(0.85, 1.0, u));
    let lane = abs(fract(u * 7.0 - av * 1.3 + seed) - 0.5) * 2.0;
    let lateral = (1.0 - smoothstep(0.0, 0.14, lane)) * smoothstep(0.06, 0.14, av) * (1.0 - smoothstep(0.7, 0.95, av));
    let net = valueNoise(vec2f(u * 40.0, v * 22.0 + seed * 5.0));
    col = mix(col, input.accent.rgb, clamp((mid * 0.75 + lateral * 0.35) * input.accent.w, 0.0, 1.0));
    col *= 1.0 + brush.x * 0.25 + brush.y * 0.1 + (net - 0.5) * 0.08;
    // Edges catch a little light; the base sits in the plant's shade.
    col *= mix(0.7, 1.0, smoothstep(0.0, 0.25, u));
    p.albedo = col;
    p.thin = input.tip.w;
    p.gloss = 0.35;
    p.ao = 1.0;
    p.cover = cover;
    return p;
  }

  // Petals.
  let blend = input.cut.w;
  let w = mix(0.09, 0.5, clamp(blend * 2.0, 0.0, 1.0));
  let edgeNoise = (valueNoise(vec2f(v * 5.0 + seed * 20.0, u * 3.0)) - 0.5) * 0.14;
  var col = mix(input.base.rgb, input.tip.rgb, smoothstep(blend - w, blend + w, u + edgeNoise));
  // Veins fan from the base; a stronger midrib.
  let count = 7.0 + floor(seed * 7.0);
  let warp = (valueNoise(vec2f(u * 2.0 + seed * 9.0, v * 1.5 + seed * 5.0)) - 0.5) * 0.12;
  let lane = abs(fract((v + warp) * count * 0.5 + 0.5) - 0.5) * 2.0;
  let veinLine = (1.0 - smoothstep(0.0, 0.16, lane)) * smoothstep(0.02, 0.3, u) * (1.0 - smoothstep(0.6, 1.0, u) * 0.7);
  let mid = (1.0 - smoothstep(0.0, 0.07 + 0.12 * smoothstep(0.7, 0.85, input.accent.w) * (1.0 - u), av)) * (1.0 - u * 0.6);
  let veins = input.accent.w;
  // Strongly veined petals (moonflower) carry a bold star along each midrib.
  let midStrength = mix(0.3, 0.9, smoothstep(0.7, 0.85, veins));
  // Detail fades in as the petal grows on screen (lines per pixel stay < ~0.5).
  let veinFade = 1.0 - smoothstep(0.3, 0.8, px.y * count * 0.5);
  col = mix(col, input.accent.rgb, clamp(veinLine * veins * 0.35 * veinFade + mid * veins * midStrength + max(brush.x, 0.0) * veins * 1.1, 0.0, 1.0));
  // Fine longitudinal veins and streaks, like a botanical plate's hatching.
  let fine = 28.0 + floor(seed * 16.0);
  let fineLane = abs(fract((v + warp * 0.6) * fine * 0.5 + seed * 3.0) - 0.5) * 2.0;
  let fineFade = 1.0 - smoothstep(0.3, 0.75, px.y * fine * 0.5);
  let fineLine = (1.0 - smoothstep(0.0, 0.4, fineLane)) * smoothstep(0.03, 0.25, u) * (1.0 - smoothstep(0.7, 1.0, u) * 0.8) * fineFade;
  let fineTone = valueNoise(vec2f(v * fine * 0.5 + seed * 11.0, u * 4.0));
  col *= 1.0 - fineLine * (0.1 + 0.25 * veins) * (0.6 + 0.8 * fineTone);
  col *= 1.0 + brush.x * 0.38 + brush.y * 0.16 * (1.0 - smoothstep(0.3, 0.8, px.y * 30.0));
  // Botanical-plate saturation, deepest toward the base.
  let deep = 1.0 - smoothstep(0.0, 0.45, u);
  col = max(mix(vec3f(luma(col)), col, 1.18 + 0.25 * deep), vec3f(0.0)) * mix(1.0, 0.78, deep);
  // Thin, lighter margins with a fine highlight right at the edge.
  col = mix(col, input.tip.rgb * 1.1, smoothstep(0.75, 1.0, av) * 0.25);
  let rim = smoothstep(limit - 0.06 - 2.0 * px.y, limit - px.y, av);
  col = mix(col, max(input.tip.rgb, vec3f(luma(input.tip.rgb))) * 1.2, rim * 0.18);
  p.albedo = col;
  p.thin = input.tip.w;
  p.gloss = 0.12;
  // Deep in the flower's heart it is darker.
  p.ao = mix(0.5, 1.0, smoothstep(0.0, 0.32, u));
  p.cover = cover;
  return p;
}

fn paintTube(input: FlowerOut, material: f32, seed: f32) -> Paint {
  let u = input.uv.x;
  let a = input.uv.y;
  let fibre = valueNoise(vec2f(a * 26.0 + seed * 11.0, u * 5.0)) - 0.5;
  var p: Paint;
  p.cover = 1.0;
  p.ao = 1.0;
  if (isM(material, M_SPINE)) {
    p.albedo = mix(input.base.rgb, input.tip.rgb, smoothstep(0.35, 1.0, u));
    p.thin = 0.3;
    p.gloss = 0.5;
    return p;
  }
  if (isM(material, M_FILAMENT)) {
    p.albedo = mix(input.base.rgb, input.tip.rgb, u) * (1.0 + fibre * 0.1);
    p.thin = 0.85;
    p.gloss = 0.3;
    return p;
  }
  // Stalks: lengthwise fibres and a darker, cooler base.
  var col = mix(input.base.rgb, input.tip.rgb, smoothstep(0.0, 1.0, u));
  col = mix(col, input.accent.rgb, smoothstep(0.25, 0.5, fibre) * 0.25);
  col *= 1.0 + fibre * 0.22;
  p.albedo = col;
  p.thin = select(0.35, 0.15, isM(material, M_CACTUS));
  // A soft satin sheen runs along living stalks.
  p.gloss = select(0.3, 0.4, isM(material, M_CACTUS));
  p.ao = mix(0.6, 1.0, smoothstep(0.0, 0.2, u));
  return p;
}

fn paintBlob(input: FlowerOut, material: f32, seed: f32) -> Paint {
  let t = input.uv.x;
  let phi = input.uv.y * TAU;
  var p: Paint;
  p.cover = 1.0;
  p.ao = 1.0;
  p.thin = input.tip.w;
  p.gloss = 0.15;
  if (isM(material, M_PAPPUS)) {
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
  if (isM(material, M_CACTUS)) {
    let ribs = input.cut.x;
    let ridge = pow(abs(cos(ribs * phi * 0.5)), 1.5);
    let striation = valueNoise(vec2f(input.uv.y * ribs * 6.0 + seed * 5.0, t * 18.0)) - 0.5;
    var col = mix(input.base.rgb * 0.62, input.tip.rgb, smoothstep(0.1, 0.95, ridge));
    col *= 1.0 + striation * 0.25;
    // Woolly crown where new growth emerges.
    col = mix(col, input.accent.rgb, (1.0 - smoothstep(0.03, 0.1, t)) * 0.7);
    p.albedo = col;
    p.thin = 0.12;
    p.gloss = 0.45;
    p.ao = mix(0.55, 1.0, ridge);
    return p;
  }
  if (isM(material, M_ANTHER)) {
    let grain = valueNoise(vec2f(t * 40.0 + seed * 7.0, input.uv.y * 60.0));
    p.albedo = mix(input.base.rgb, input.tip.rgb, smoothstep(0.45, 0.8, grain));
    p.thin = 0.2;
    p.gloss = 0.25;
    return p;
  }
  if (isM(material, M_DISK)) {
    let grain = valueNoise(vec2f(t * 30.0 + seed * 3.0, input.uv.y * 40.0));
    p.albedo = mix(input.base.rgb, input.tip.rgb, clamp((1.0 - t) * 0.8 - 0.2 + (grain - 0.5) * 0.5, 0.0, 1.0));
    p.thin = 0.15;
    p.gloss = 0.3;
    p.ao = mix(1.0, 0.65, smoothstep(0.5, 1.0, t));
    return p;
  }
  // Petal-, leaf- and stem-skinned blobs (buds, corolla tubes, calyxes): meridian streaks.
  let streak = valueNoise(vec2f(input.uv.y * 24.0 + seed * 17.0, t * 2.5)) - 0.5;
  var col = mix(input.base.rgb, input.tip.rgb, smoothstep(0.9, 0.1, t));
  col = mix(col, input.accent.rgb, clamp(streak * input.accent.w, 0.0, 1.0));
  col *= 1.0 + streak * 0.2;
  p.albedo = col;
  p.gloss = select(0.15, 0.3, isM(material, M_LEAF));
  p.ao = mix(1.0, 0.7, smoothstep(0.55, 1.0, t));
  return p;
}

struct FragOut {
  @location(0) color: vec4f,
  // Anti-aliased margins: coverage becomes an MSAA sample mask, so the
  // alpha channel stays free for the painterly filter's distance code.
  @builtin(sample_mask) mask: u32,
}

// Dithered 4x coverage mask, rotated per pixel so partial edges blend smoothly.
// Assumes 4x MSAA: both the world's scene target and the flower studio's
// target are created with `msaa: true`, which vgpu maps to 4 samples, so only
// the low four mask bits exist. On a 1-sample target bit 0 alone decides, and
// petal margins would alias (cover >= ~0.25 draws, less is dropped).
fn coverageMask(cover: f32, pixel: vec2f) -> u32 {
  let jitter = fract(sin(dot(floor(pixel), vec2f(12.9898, 78.233))) * 43758.5453);
  let samples = u32(clamp(floor(cover * 4.0 + jitter * 0.999), 0.0, 4.0));
  let bits = (1u << samples) - 1u;
  let r = u32(floor(jitter * 4.0)) & 3u;
  return ((bits << r) | (bits >> ((4u - r) & 3u))) & 15u;
}

@fragment fn fs_main(input: FlowerOut) -> FragOut {
  // Derivatives first, in uniform control flow.
  let d = fwidth(input.uv);
  let material = input.base.w;
  let seed = input.misc.y;
  let kind = input.misc.w;
  var p: Paint;
  if (abs(kind - T_SHEET) < 0.5) {
    p = paintSheet(input, material, seed, d);
  } else if (abs(kind - T_TUBE) < 0.5) {
    p = paintTube(input, material, seed);
  } else {
    p = paintBlob(input, material, seed);
  }

  let toEye = normalize(world.eye - input.worldPos);
  var n = normalize(input.normal);
  let backside = dot(n, toEye) < 0.0;
  if (backside) {
    n = -n;
  }
  var albedo = p.albedo;
  if (backside && abs(kind - T_SHEET) < 0.5) {
    // Petal and leaf undersides are paler and cooler.
    albedo = mix(albedo, vec3f(luma(albedo)) * vec3f(0.96, 1.0, 1.05), 0.1) * 1.04;
  }

  let light = normalize(world.lightDir);
  let ndl = dot(n, light);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, input.worldPos, n);
  let direct = smoothstep(-0.3, 0.85, ndl) * shadow;
  let key = world.lightColor * world.lightIntensity;
  let skyFill = world.ambient * (0.55 + 0.3 * n.y);
  var lit = albedo * (skyFill * p.ao + key * direct * mix(0.75, 1.0, p.ao));

  // Light through thin tissue: saturated colour where the key light is behind.
  let through = max(-ndl, 0.0);
  let forward = pow(max(dot(-toEye, light), 0.0), 3.0);
  // Pale petals glow less through than saturated ones, so whites keep their form.
  let transmit = albedo * (albedo * 1.3 + vec3f(0.12)) * (1.0 - 0.45 * smoothstep(0.35, 0.8, luma(albedo)));
  lit += key * transmit * p.thin * (through * 0.5 + forward * 0.7) * (0.35 + 0.65 * shadow);

  // Soft subsurface fill: thin tissue never falls to a flat, unlit colour.
  lit += key * albedo * albedo * p.thin * 0.28 * (1.0 - 0.7 * direct);

  // Rim of light along silhouettes.
  let rim = pow(1.0 - max(dot(n, toEye), 0.0), 3.0);
  lit += key * albedo * rim * (0.25 + 0.6 * max(dot(-toEye, light), 0.0)) * (0.4 + 0.6 * shadow);

  // Waxy or satin highlight.
  let h = normalize(light + toEye);
  lit += key * pow(max(dot(n, h), 0.0), 18.0 + p.gloss * 70.0) * p.gloss * 0.45 * shadow;

  // Botanical-plate luminosity, and moonflowers glowing in the dark.
  lit += albedo * (0.05 * (1.0 - 0.7 * world.night) + input.misc.z * (0.12 + world.night * 1.15));
  if (abs(input.misc.x - flowers.hovered) < 0.5) {
    lit *= 1.12;
    lit += albedo * 0.06;
  }

  let color = aerial(lit, input.worldPos, world);
  let near = length(input.worldPos - world.eye) < flowers.detailNear;
  var out: FragOut;
  out.color = vec4f(color, select(distanceAlpha(input.worldPos, world), -1.0, near));
  out.mask = select(15u, coverageMask(p.cover, input.clip.xy), p.cover < 0.999);
  return out;
}
