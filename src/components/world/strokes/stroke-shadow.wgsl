// Shadow casters: strokes rendered from the key light into the shadow map,
// alpha-tested by the same brush mask so leaves cast dappled shadows.
import { World } from "../shaders/common.wgsl";
import { bristleMask } from "./brush.wgsl";
import { expandStroke } from "./stroke-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;

struct CasterIn {
  @builtin(vertex_index) vertex: u32,
  @location(0) origin: vec3f,
  @location(1) axis: vec3f,
  @location(2) shape: vec4f,
  @location(3) normal: vec3f,
  @location(4) paint: vec4f,
}

struct CasterOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) params: vec2f,
}

@vertex fn vs_main(input: CasterIn) -> CasterOut {
  // Face the strokes toward the light: a point far along the light direction.
  let facing = input.origin + normalize(world.lightDir) * 500.0;
  let stroke = expandStroke(input.vertex, input.origin, input.axis, input.shape, input.normal, facing, world);
  var out: CasterOut;
  out.clip = world.lightViewProjection * vec4f(stroke.position, 1.0);
  out.uv = stroke.uv;
  out.params = vec2f(input.shape.z, input.paint.w);
  return out;
}

@fragment fn fs_main(input: CasterOut) -> @location(0) vec4f {
  if (bristleMask(input.uv, input.params.x, input.params.y).x < 0.5) {
    discard;
  }
  return vec4f(1.0);
}
