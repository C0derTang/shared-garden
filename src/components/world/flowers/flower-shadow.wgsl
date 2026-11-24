// Flowers cast shadows into the key light's shadow map (same swayed geometry
// as the lit pass; margins are not alpha-tested).
import { World } from "../shaders/common.wgsl";
import { FlowerParams, blobSurface, sheetSurface, sheetU, sway, tubeSurface } from "./flower-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<uniform> flowers: FlowerParams;

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

fn project(input: PartIn, position: vec3f) -> vec4f {
  let p = position + sway(position, input.anchor, input.i5.y, world.time, flowers.sway);
  return world.lightViewProjection * vec4f(p, 1.0);
}

@vertex fn vs_sheet(input: PartIn) -> @builtin(position) vec4f {
  let s = sheetSurface(sheetU(input.grid.x), input.grid.y * 2.0 - 1.0, input.i0, input.i1, input.i2, input.i3, input.i4, input.i6, input.i5.z);
  return project(input, s.position);
}

@vertex fn vs_tube(input: PartIn) -> @builtin(position) vec4f {
  let s = tubeSurface(input.grid.x, input.grid.y, input.i0, input.i1, input.i2, input.i3);
  return project(input, s.position);
}

@vertex fn vs_blob(input: PartIn) -> @builtin(position) vec4f {
  let s = blobSurface(input.grid.x, input.grid.y, input.i0, input.i1, input.i2, input.i3, input.i5.z);
  return project(input, s.position);
}

@fragment fn fs_shadow() -> @location(0) vec4f {
  return vec4f(1.0);
}
