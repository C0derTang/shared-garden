// Instanced brushstrokes: every leaf, blade, reed, petal and dab of soil in
// the world (and anything a layer paints) is one instance of this shader.
import { World, aerial, belowMirror, distanceAlpha, lampLight, shadowFactor, skyColor } from "../shaders/common.wgsl";
import { bristleColor, bristleMask } from "./brush.wgsl";
import { KIND_BLADE, KIND_FOLIAGE, KIND_PETAL, KIND_SKY, KIND_STAR, KIND_TRUNK, expandStroke, isKind } from "./stroke-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var shadowMap: texture_depth_2d;
@group(0) @binding(2) var shadowSampler: sampler_comparison;

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
  @location(1) @interpolate(flat) albedo: vec3f,
  // seed, dryness, opacity, kind
  @location(2) @interpolate(flat) params: vec4f,
  @location(3) worldPos: vec3f,
  @location(4) @interpolate(flat) normal: vec3f,
  @location(5) @interpolate(flat) axisDir: vec3f,
  @location(6) @interpolate(flat) len: f32,
}

@vertex fn vs_main(input: StrokeIn) -> StrokeOut {
  let kind = input.shape.w;
  let stroke = expandStroke(input.vertex, input.origin, input.axis, input.shape, input.normal, world.eye, world);
  var out: StrokeOut;
  out.clip = world.viewProjection * vec4f(stroke.position, 1.0);
  out.uv = stroke.uv;
  out.worldPos = stroke.position;
  out.albedo = input.paint.rgb;
  out.normal = normalize(input.normal);
  out.axisDir = normalize(input.axis);
  out.len = length(input.axis);
  let opacity = select(1.0, world.stars, isKind(kind, KIND_STAR));
  let dryness = select(input.paint.w, 0.25, isKind(kind, KIND_SKY));
  out.params = vec4f(input.shape.z, dryness, opacity, kind);
  return out;
}

@fragment fn fs_main(input: StrokeOut) -> @location(0) vec4f {
  let seed = input.params.x;
  let kind = input.params.w;
  let mask = bristleMask(input.uv, seed, input.params.y);
  let alpha = mask.x * input.params.z;
  if (alpha < 0.5 || belowMirror(input.worldPos, world)) {
    discard;
  }
  let toCamera = normalize(world.eye - input.worldPos);
  let light = normalize(world.lightDir);
  var color: vec3f;
  if (isKind(kind, KIND_SKY)) {
    color = skyColor(normalize(input.worldPos - world.eye), world) * input.albedo;
  } else if (isKind(kind, KIND_STAR)) {
    color = input.albedo * 2.4;
  } else {
    var n = input.normal;
    let upright = isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL) || isKind(kind, KIND_TRUNK);
    if (upright) {
      // Thin, camera-facing cards: light them like a rounded strand.
      let side = normalize(cross(input.axisDir, toCamera));
      n = normalize(mix(n, toCamera, 0.35) + side * input.uv.y * 0.45);
    }
    let ndl = dot(n, light);
    let lit = smoothstep(-0.45, 0.8, ndl + (seed - 0.5) * 0.3);
    let shadow = shadowFactor(shadowMap, shadowSampler, world, input.worldPos, n);
    let direct = lit * shadow;
    let skyFill = world.ambient * (0.38 + 0.3 * max(n.y, 0.0));
    // Cool shadows, warm light.
    let shade = mix(vec3f(0.78, 0.86, 1.05), vec3f(1.0), direct);
    var shaded = input.albedo * (skyFill * shade + world.lightColor * world.lightIntensity * direct);
    if (isKind(kind, KIND_PETAL)) {
      shaded = input.albedo * (world.ambient * 0.7 + world.lightColor * world.lightIntensity * (0.3 + 0.7 * direct));
    }
    if (isKind(kind, KIND_FOLIAGE) || isKind(kind, KIND_BLADE) || isKind(kind, KIND_PETAL)) {
      // Thin leaves and long grass glow through when backlit by a low sun.
      let behind = pow(max(dot(-toCamera, light), 0.0), 3.0) * smoothstep(-0.05, 0.15, light.y);
      // Short lawn blades stay matte; long grass and leaves light up.
      let thin = select(1.0, smoothstep(0.12, 0.35, input.len), isKind(kind, KIND_BLADE));
      shaded += world.lightColor * world.lightIntensity * behind * input.albedo * mix(1.2, 2.2, seed) * (0.4 + 0.6 * shadow) * thin;
      // Rim light along silhouettes.
      let rim = pow(1.0 - abs(dot(n, toCamera)), 3.0) * (0.35 + 0.65 * max(dot(-toCamera, light), 0.0));
      shaded += world.lightColor * world.lightIntensity * rim * 0.6 * input.albedo * shadow;
    }
    shaded += input.albedo * lampLight(input.worldPos, n, world);
    color = aerial(shaded, input.worldPos, world);
  }
  color = bristleColor(color, mask.y, 0.28);
  if (isKind(kind, KIND_BLADE)) {
    // Darker at the root, sunlit toward the tip.
    color *= mix(mix(0.85, 0.55, smoothstep(0.1, 0.4, input.len)), 1.12, input.uv.x);
  }
  return vec4f(color, distanceAlpha(input.worldPos, world));
}
