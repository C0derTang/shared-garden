// The house drawn from the key light into the shadow map.
import { World } from "../shaders/common.wgsl";
import { House, MAT_GLASS, MAT_INTERIOR, isMaterial, swingDoor } from "./house-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<uniform> house: House;

struct CasterIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) material: f32,
}

struct CasterOut {
  @builtin(position) clip: vec4f,
  @location(0) @interpolate(flat) material: f32,
}

@vertex fn vs_main(input: CasterIn) -> CasterOut {
  var out: CasterOut;
  out.clip = world.lightViewProjection * vec4f(swingDoor(input.position, input.material, house), 1.0);
  out.material = input.material;
  return out;
}

@fragment fn fs_main(input: CasterOut) -> @location(0) vec4f {
  // The room inside never shades the outside; panes are part of the walls.
  if (isMaterial(input.material, MAT_INTERIOR) || isMaterial(input.material, MAT_GLASS)) {
    discard;
  }
  return vec4f(1.0);
}
