import { World, aerial, belowMirror, distanceAlpha, fbm, srgbToLinear } from "./common.wgsl";

// Distant ranges across the lake: forested foothills, rock, snow on the
// highest peaks, all deep in atmospheric haze.
@group(0) @binding(0) var<uniform> world: World;

struct MountainIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
}

struct MountainOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@vertex fn vs_main(input: MountainIn) -> MountainOut {
  var out: MountainOut;
  out.clip = world.viewProjection * vec4f(input.position, 1.0);
  out.worldPos = input.position;
  out.normal = input.normal;
  return out;
}

@fragment fn fs_main(input: MountainOut) -> @location(0) vec4f {
  if (belowMirror(input.worldPos, world)) {
    discard;
  }
  let p = input.worldPos;
  let n = normalize(input.normal);
  let streak = fbm(vec2f(p.x * 0.04, p.y * 0.25));
  let forest = srgbToLinear(vec3f(0.2, 0.27, 0.2));
  let rock = srgbToLinear(vec3f(0.42, 0.38, 0.4));
  let snow = srgbToLinear(vec3f(0.92, 0.92, 0.95));
  var albedo = mix(forest, rock, smoothstep(14.0, 34.0, p.y + streak * 14.0));
  let snowLine = 48.0 + streak * 14.0;
  albedo = mix(albedo, snow, smoothstep(snowLine, snowLine + 6.0, p.y) * smoothstep(0.25, 0.6, n.y));
  albedo *= 0.85 + streak * 0.3;
  let light = normalize(world.lightDir);
  let direct = max(dot(n, light), 0.0);
  var color = albedo * (world.ambient * (0.55 + 0.25 * n.y) + world.lightColor * world.lightIntensity * direct);
  color = aerial(color, p, world);
  return vec4f(color, distanceAlpha(p, world));
}
