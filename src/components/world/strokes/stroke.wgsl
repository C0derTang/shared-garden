// Instanced brushstrokes: every dab of paint in the world (sky, trees, grass,
// soil, and anything a layer paints) is one instance of this shader.
import { World, aerial, belowMirror, distanceAlpha, skyColor } from "../shaders/common.wgsl";
import { bristleColor, bristleMask } from "./brush.wgsl";

@group(0) @binding(0) var<uniform> world: World;

struct StrokeIn {
  @builtin(vertex_index) vertex: u32,
  @location(0) origin: vec3f,
  @location(1) axis: vec3f,
  // width, bend, seed, kind
  @location(2) shape: vec4f,
  @location(3) normal: vec3f,
  // linear rgb, extra (cloudiness for sky, dryness otherwise)
  @location(4) paint: vec4f,
}

struct StrokeOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) color: vec3f,
  // seed, dryness, opacity, kind
  @location(2) @interpolate(flat) params: vec4f,
  @location(3) worldPos: vec3f,
}

const SEGMENTS: u32 = 4u;
const KIND_SURFACE: f32 = 0.0;
const KIND_BLADE: f32 = 1.0;
const KIND_FOLIAGE: f32 = 2.0;
const KIND_SKY: f32 = 4.0;
const KIND_STAR: f32 = 5.0;
const KIND_PETAL: f32 = 6.0;

fn isKind(kind: f32, wanted: f32) -> bool {
  return abs(kind - wanted) < 0.5;
}

@vertex fn vs_main(input: StrokeIn) -> StrokeOut {
  var cornerU = array<f32, 6>(0.0, 1.0, 1.0, 0.0, 1.0, 0.0);
  var cornerV = array<f32, 6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  let segment = input.vertex / 6u;
  let corner = input.vertex % 6u;
  let u = (f32(segment) + cornerU[corner]) / f32(SEGMENTS);
  let v = cornerV[corner];

  let width = input.shape.x;
  let bend = input.shape.y;
  let seed = input.shape.z;
  let kind = input.shape.w;
  let len = max(length(input.axis), 1e-5);
  let dir = input.axis / len;

  var center = input.origin + input.axis * u;
  if (isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL)) {
    let gust = sin(world.time * 1.1 + input.origin.x * 0.35 + input.origin.z * 0.2) * 0.5 + sin(world.time * 2.3 + seed * 6.283) * 0.2;
    center += vec3f(gust * 0.12, 0.0, gust * 0.04) * len * u * u;
  }
  let toCamera = normalize(world.eye - center);
  let lies = isKind(kind, KIND_SURFACE) || isKind(kind, KIND_FOLIAGE);
  var side = select(cross(dir, toCamera), cross(dir, input.normal), lies);
  if (length(side) < 1e-4) {
    side = cross(dir, vec3f(0.0, 0.0, 1.0));
  }
  side = normalize(side);
  center += side * bend * len * u * u;

  var halfWidth = width * 0.5;
  var opacity = 1.0;
  if (isKind(kind, KIND_STAR)) {
    opacity = world.stars;
    halfWidth *= step(0.01, world.stars);
  }
  let position = center + side * v * halfWidth;

  var out: StrokeOut;
  out.clip = world.viewProjection * vec4f(position, 1.0);
  out.uv = vec2f(u, v);
  out.worldPos = position;

  let light = normalize(world.lightDir);
  var color: vec3f;
  if (isKind(kind, KIND_SKY)) {
    let ray = normalize(input.origin - world.eye);
    let base = skyColor(ray, world);
    let cloudLit = mix(world.ambient * 1.1 + world.horizon * 0.3, world.lightColor * world.lightIntensity * 0.8 + world.horizon * 0.35, 0.55 + 0.45 * world.glow);
    color = mix(base, cloudLit, input.paint.w) * input.paint.rgb;
  } else if (isKind(kind, KIND_STAR)) {
    color = input.paint.rgb * 2.4;
  } else {
    var n = normalize(input.normal);
    if (isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL)) {
      n = normalize(mix(n, toCamera, 0.3));
    }
    let ndl = dot(n, light);
    let lit = smoothstep(-0.3, 0.8, ndl + (seed - 0.5) * 0.35);
    let ambient = world.ambient * (0.42 + 0.28 * max(n.y, 0.0));
    var shaded = input.paint.rgb * (ambient + world.lightColor * world.lightIntensity * lit);
    if (isKind(kind, KIND_PETAL)) {
      shaded = input.paint.rgb * (world.ambient * 0.7 + world.lightColor * world.lightIntensity * (0.35 + 0.65 * lit));
    }
    // Leaves and blades are thin: backlit by a low sun they glow through.
    let behind = pow(max(dot(-toCamera, light), 0.0), 3.0) * smoothstep(-0.05, 0.15, light.y);
    if (isKind(kind, KIND_FOLIAGE) || isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL)) {
      // Short lawn blades stay matte; long grass and leaves light up.
      let thin = select(1.0, smoothstep(0.12, 0.35, len), isKind(kind, KIND_BLADE));
      shaded += world.lightColor * world.lightIntensity * behind * thin * input.paint.rgb * mix(1.2, 2.2, seed);
      let rim = pow(1.0 - max(dot(n, toCamera), 0.0), 2.0) * max(dot(-toCamera, light), 0.0);
      shaded += world.lightColor * world.lightIntensity * rim * 0.5 * input.paint.rgb;
    }
    color = aerial(shaded, center, world);
  }
  out.color = color;
  let dryness = select(input.paint.w, 0.25, isKind(kind, KIND_SKY));
  out.params = vec4f(seed, dryness, opacity, kind);
  return out;
}

@fragment fn fs_main(input: StrokeOut) -> @location(0) vec4f {
  let mask = bristleMask(input.uv, input.params.x, input.params.y);
  let alpha = mask.x * input.params.z;
  if (alpha < 0.5 || belowMirror(input.worldPos, world)) {
    discard;
  }
  var color = bristleColor(input.color, mask.y, 0.3);
  if (isKind(input.params.w, KIND_BLADE)) {
    // Darker at the root, sunlit toward the tip.
    color *= mix(0.6, 1.1, input.uv.x);
  }
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
