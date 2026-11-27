// The landing's lakeside house: clapboard walls, fieldstone foundation and
// chimney, slate shingles, cream trim, a red plank door, warm windows and
// lanterns, and the glowing room behind the door.
import { World, aerial, belowMirror, distanceAlpha, fbm, hash21, lampLight, shadowFactor, srgbToLinear, valueNoise } from "../shaders/common.wgsl";
import {
  House,
  MAT_DOOR,
  MAT_BACK_DOOR,
  MAT_FRAME,
  MAT_GLASS,
  MAT_INTERIOR,
  MAT_LANTERN,
  MAT_PLANK,
  MAT_ROOF,
  MAT_SIDING,
  MAT_STONE,
  isMaterial,
  swingDoor,
  swingDoorNormal,
} from "./house-core.wgsl";

@group(0) @binding(0) var<uniform> world: World;
@group(0) @binding(1) var<uniform> house: House;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var shadowSampler: sampler_comparison;

struct HouseIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) material: f32,
}

struct HouseOut {
  @builtin(position) clip: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) material: f32,
}

@vertex fn vs_main(input: HouseIn) -> HouseOut {
  let p = swingDoor(input.position, input.material, house);
  var out: HouseOut;
  out.clip = world.viewProjection * vec4f(p, 1.0);
  out.worldPos = p;
  out.normal = swingDoorNormal(input.normal, input.material, house);
  out.uv = input.uv;
  out.material = input.material;
  return out;
}

// Warm interior light seen through glass and the doorway.
fn warmLight() -> vec3f {
  return vec3f(1.0, 0.62, 0.3);
}

// Irregular fieldstone courses with recessed mortar. Returns (albedo, mortar 0..1).
fn fieldstone(uv: vec2f) -> vec4f {
  let q = uv * vec2f(2.4, 3.3);
  let row = floor(q.y + fbm(vec2f(q.x * 0.6, 3.0)) * 0.35);
  let shifted = q.x + row * 0.53 + fbm(vec2f(row * 2.1, q.y * 0.8)) * 0.6;
  let col = floor(shifted);
  let fx = fract(shifted);
  let fy = fract(q.y + fbm(vec2f(q.x * 0.6, 3.0)) * 0.35);
  let edge = min(min(fx, 1.0 - fx) * 1.4, min(fy, 1.0 - fy));
  let mortar = 1.0 - smoothstep(0.03, 0.11, edge + (valueNoise(q * 6.0) - 0.5) * 0.05);
  let id = hash21(vec2f(col, row));
  let warm = srgbToLinear(vec3f(0.62, 0.55, 0.45));
  let grey = srgbToLinear(vec3f(0.5, 0.5, 0.48));
  let ochre = srgbToLinear(vec3f(0.6, 0.48, 0.32));
  var stone = mix(grey, warm, smoothstep(0.2, 0.8, id));
  stone = mix(stone, ochre, step(0.82, id) * 0.6);
  stone *= 0.8 + fbm(q * 3.0 + id * 9.0) * 0.4;
  let mortarColor = srgbToLinear(vec3f(0.36, 0.34, 0.3));
  return vec4f(mix(stone, mortarColor, mortar), mortar);
}

@fragment fn fs_main(input: HouseOut) -> @location(0) vec4f {
  if (belowMirror(input.worldPos, world)) {
    discard;
  }
  let m = input.material;
  let p = input.worldPos;
  let uv = input.uv;
  let toCamera = normalize(world.eye - p);
  var n = normalize(input.normal);
  // Single-sided cards (panes, the door's back) light from the side we see.
  if (dot(n, toCamera) < 0.0) {
    n = -n;
  }
  var albedo = vec3f(0.5);
  var emission = vec3f(0.0);
  var gloss = 0.0;
  var occlusion = 1.0;

  if (isMaterial(m, MAT_SIDING)) {
    // Clapboards: each board's lower lip casts a thin shadow on the one below.
    let b = uv.y * 4.6;
    let row = floor(b);
    let f = fract(b);
    let grain = fbm(vec2f(uv.x * 1.4 + row * 7.3, f * 2.0 + row));
    let streak = valueNoise(vec2f(uv.x * 9.0, row * 3.7));
    let honey = srgbToLinear(vec3f(0.62, 0.42, 0.26));
    let cedar = srgbToLinear(vec3f(0.52, 0.32, 0.2));
    let weathered = srgbToLinear(vec3f(0.56, 0.47, 0.38));
    albedo = mix(cedar, honey, grain);
    albedo = mix(albedo, weathered, smoothstep(0.55, 0.9, fbm(uv * vec2f(0.4, 0.9) + 4.0)) * 0.45);
    albedo *= 0.9 + 0.16 * hash21(vec2f(row, floor(uv.x * 0.45 + row * 0.37))) + (streak - 0.5) * 0.08;
    occlusion = mix(0.55, 1.0, smoothstep(0.0, 0.2, f));
    n = normalize(n + vec3f(0.0, (f - 0.6) * 0.35, 0.0));
  } else if (isMaterial(m, MAT_STONE)) {
    let s = fieldstone(uv);
    albedo = s.rgb;
    occlusion = 1.0 - s.a * 0.35;
    // Moss creeping up from the ground.
    let moss = smoothstep(0.35, -0.2, p.y) * smoothstep(0.45, 0.75, fbm(uv * 2.5));
    albedo = mix(albedo, srgbToLinear(vec3f(0.28, 0.36, 0.15)), moss * 0.7);
  } else if (isMaterial(m, MAT_ROOF)) {
    // Slate shingles in staggered courses, with moss and lichen.
    let course = uv.y * 4.2;
    let row = floor(course);
    let f = fract(course);
    let tab = floor(uv.x * 2.6 + row * 0.5);
    let id = hash21(vec2f(tab, row));
    let slate = srgbToLinear(vec3f(0.27, 0.28, 0.31));
    let blue = srgbToLinear(vec3f(0.24, 0.27, 0.33));
    let warm = srgbToLinear(vec3f(0.36, 0.31, 0.28));
    albedo = mix(slate, blue, id);
    albedo = mix(albedo, warm, step(0.8, id) * 0.6);
    let gap = smoothstep(0.0, 0.06, fract(uv.x * 2.6 + row * 0.5)) * smoothstep(1.0, 0.94, fract(uv.x * 2.6 + row * 0.5));
    occlusion = mix(0.5, 1.0, smoothstep(0.0, 0.25, f)) * mix(0.7, 1.0, gap);
    let moss = smoothstep(0.55, 0.8, fbm(uv * 0.9 + 2.0));
    albedo = mix(albedo, srgbToLinear(vec3f(0.3, 0.38, 0.16)), moss * 0.55);
    n = normalize(n + toCamera * (f - 0.5) * 0.2);
  } else if (isMaterial(m, MAT_PLANK)) {
    let board = uv.y * 6.5;
    let row = floor(board);
    let f = fract(board);
    albedo = mix(srgbToLinear(vec3f(0.42, 0.33, 0.24)), srgbToLinear(vec3f(0.55, 0.45, 0.33)), fbm(vec2f(uv.x * 1.2, row * 5.0)));
    albedo *= 0.9 + 0.15 * hash21(vec2f(row, 2.0));
    occlusion = mix(0.6, 1.0, smoothstep(0.0, 0.08, f) * smoothstep(1.0, 0.92, f));
  } else if (isMaterial(m, MAT_FRAME)) {
    // Black iron lantern caps.
    albedo = srgbToLinear(vec3f(0.1, 0.09, 0.08));
    gloss = 0.4;
  } else if (isMaterial(m, MAT_GLASS)) {
    // Six panes behind cream mullions; the room glows warm, curtains at the sides.
    let panes = fract(uv * vec2f(2.0, 3.0));
    let bar = 1.0 - smoothstep(0.03, 0.06, min(min(panes.x, 1.0 - panes.x) * 0.5, min(panes.y, 1.0 - panes.y) * 0.33));
    let border = 1.0 - smoothstep(0.02, 0.045, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    let mullion = max(bar, border);
    let curtain = smoothstep(0.24, 0.1, uv.x) + smoothstep(0.76, 0.9, uv.x);
    let fold = 0.75 + 0.25 * sin(uv.x * 60.0);
    let room = mix(1.0, 0.55, smoothstep(0.1, 0.9, uv.y)) * (0.8 + 0.4 * fbm(uv * 3.0 + 7.0));
    var glow = warmLight() * room * mix(1.0, 0.6 * fold, clamp(curtain, 0.0, 1.0));
    glow = mix(glow, vec3f(0.95, 0.5, 0.35) * fold, clamp(curtain, 0.0, 1.0) * 0.5);
    // By day the panes mostly mirror the sky; the warmth shows through as it darkens.
    let skyReflect = mix(world.horizon, world.zenith, 0.5) * 0.55;
    emission = glow * house.windows * (1.0 - mullion);
    albedo = mix(skyReflect, srgbToLinear(vec3f(0.86, 0.82, 0.72)), mullion);
    occlusion = mix(0.35, 1.0, mullion);
    gloss = (1.0 - mullion) * 0.6;
  } else if (isMaterial(m, MAT_LANTERN)) {
    let cell = fract(uv * vec2f(9.0, 6.0));
    let bar = 1.0 - smoothstep(0.06, 0.14, min(min(cell.x, 1.0 - cell.x), min(cell.y, 1.0 - cell.y)));
    albedo = srgbToLinear(vec3f(0.1, 0.09, 0.08));
    let flicker = 0.92 + 0.08 * sin(house.time * 7.0 + p.x * 3.0) * sin(house.time * 3.1);
    emission = warmLight() * vec3f(1.0, 0.9, 0.8) * house.windows * 2.4 * flicker * (1.0 - bar);
  } else if (isMaterial(m, MAT_DOOR) || isMaterial(m, MAT_BACK_DOOR)) {
    // A red plank door: raised frame, vertical boards, a four-pane window and a brass knob.
    let boards = fract(uv.x * 5.0);
    let groove = smoothstep(0.0, 0.05, boards) * smoothstep(1.0, 0.95, boards);
    let rails = 1.0 - (smoothstep(0.07, 0.1, uv.x) * smoothstep(0.93, 0.9, uv.x) * smoothstep(0.05, 0.08, uv.y) * smoothstep(0.95, 0.92, uv.y));
    let midRail = smoothstep(0.43, 0.45, uv.y) * smoothstep(0.52, 0.5, uv.y);
    let red = srgbToLinear(vec3f(0.55, 0.14, 0.1));
    let deep = srgbToLinear(vec3f(0.4, 0.08, 0.07));
    albedo = mix(deep, red, fbm(vec2f(uv.x * 8.0, uv.y * 1.5)));
    albedo *= mix(0.72, 1.0, groove);
    albedo = mix(albedo, albedo * 1.18, max(rails, midRail));
    occlusion = mix(0.85, 1.0, max(rails, midRail));
    let window = step(0.2, uv.x) * step(uv.x, 0.8) * step(0.7, uv.y) * step(uv.y, 0.9);
    let pane = fract(vec2f((uv.x - 0.2) / 0.3, (uv.y - 0.7) / 0.1));
    let paneBar = 1.0 - smoothstep(0.04, 0.09, min(min(pane.x, 1.0 - pane.x), min(pane.y, 1.0 - pane.y)));
    let doorGlow=select(0.0,house.glow,isMaterial(m,MAT_DOOR));
    let doorSpill=select(0.0,house.spill,isMaterial(m,MAT_DOOR));
    let lit = house.windows + doorGlow * 1.5 + doorSpill * 4.0;
    emission += warmLight() * window * (1.0 - paneBar) * lit * 1.3;
    albedo = mix(albedo, srgbToLinear(vec3f(0.86, 0.82, 0.72)), window * paneBar);
    let knob = 1.0 - smoothstep(0.025, 0.04, length((uv - vec2f(0.86, 0.47)) * vec2f(1.0, 0.51)));
    albedo = mix(albedo, srgbToLinear(vec3f(0.78, 0.6, 0.28)), knob);
    gloss = max(gloss, knob * 1.5);
    // The invitation: light leaking around the door's edges, breathing softly.
    let edge = min(min(uv.x, 1.0 - uv.x) * 1.95, min(uv.y, 1.0 - uv.y));
    let leak = 1.0 - smoothstep(0.0, 0.09, edge);
    emission += warmLight() * leak * doorGlow * 3.2;
    emission += warmLight() * doorGlow * 0.14 * (1.0 - window);
  } else if (isMaterial(m, MAT_INTERIOR)) {
    // The lit room: cream plaster, a honey floor and a hearth's glow deep inside.
    let floorPart = 1.0 - smoothstep(0.62, 0.7, p.y);
    let plaster = srgbToLinear(vec3f(0.96, 0.86, 0.7));
    let wood = srgbToLinear(vec3f(0.62, 0.42, 0.26));
    let base = mix(plaster, wood, floorPart);
    let hearth = 0.8 + 0.4 * fbm(uv * 1.5 + house.time * 0.05);
    let level = 1.2 + house.spill * 2.6 + house.windows * 0.35;
    let color = base * warmLight() * vec3f(1.2, 1.15, 1.1) * level * hearth;
    return vec4f(color, distanceAlpha(p, world));
  } else {
    // Cream painted trim.
    albedo = srgbToLinear(vec3f(0.85, 0.81, 0.72)) * (0.92 + 0.12 * fbm(uv * vec2f(3.0, 6.0)));
  }

  let light = normalize(world.lightDir);
  let shadow = shadowFactor(shadowMap, shadowSampler, world, p, n);
  let ndl = dot(n, light);
  let direct = smoothstep(-0.2, 0.7, ndl) * shadow;
  let fill = world.ambient * (0.62 + 0.38 * max(n.y, 0.0)) * mix(vec3f(0.86, 0.9, 1.06), vec3f(1.0), direct);
  let bounce = world.lightColor * world.lightIntensity * 0.1 * clamp(0.5 - n.y * 0.5, 0.0, 1.0);
  var color = albedo * occlusion * (fill + bounce + world.lightColor * world.lightIntensity * direct * 0.95 + lampLight(p, n, world) * 1.3);
  // Rim light where the low sun grazes edges.
  let rim = pow(1.0 - max(dot(n, toCamera), 0.0), 3.0) * max(dot(-toCamera, light), 0.0);
  color += world.lightColor * world.lightIntensity * rim * 0.35 * albedo * shadow;
  // Specular glints on glass, iron and the brass knob.
  let halfway = normalize(light + toCamera);
  color += world.lightColor * world.lightIntensity * gloss * pow(max(dot(n, halfway), 0.0), 60.0) * shadow * 2.0;
  color += emission;
  color = aerial(color, p, world);
  return vec4f(color, distanceAlpha(p, world));
}
