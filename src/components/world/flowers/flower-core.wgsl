// Procedural flower geometry: bends instanced template grids into petals,
// stalks and blobs. Mirrors `src/lib/world/flowers/parts.ts`. Pure module.
import { valueNoise } from "../shaders/common.wgsl";

export const PI: f32 = 3.14159265;
export const TAU: f32 = 6.2831853;

export struct Surface {
  position: vec3f,
  normal: vec3f,
}

// Per-draw controls shared by every flower draw.
export struct FlowerParams {
  // Index of the hovered flower, or -1.
  hovered: f32,
  // Wind sway amount (0 under reduced motion).
  sway: f32,
  // Pixels nearer than this keep their botanical detail through the painterly filter.
  detailNear: f32,
  // Strength of the soft coloured aura (the shared plot-glow level in the world).
  aura: f32,
  // How much the hovered flower's aura brightens and widens.
  boost: f32,
  grow: f32,
}

// ---------------------------------------------------------------- sheets

// Superellipse end: 1 at t = 0, closing to 0 at t = 1 (p = 2 round, 1 straight, < 1 spiky).
fn superEnd(t: f32, p: f32) -> f32 {
  return pow(max(1.0 - pow(clamp(t, 0.0, 1.0), p), 0.0), 1.0 / p);
}

// Width (0..1 of the widest) along a blade: a rounded base rising to the
// widest point, then a tip that is broad and round (tipShape ≈ 0.3) through
// pointed (≈ 1) to slender and spiky (> 1.2).
fn sheetProfile(u: f32, widthPos: f32, tipShape: f32, baseWidth: f32) -> f32 {
  let wp = clamp(widthPos, 0.08, 0.92);
  var w: f32;
  if (u >= wp) {
    w = superEnd((u - wp) / (1.0 - wp), clamp(3.0 - 2.0 * tipShape, 0.45, 3.5));
  } else {
    w = superEnd((wp - u) / wp, 1.7);
  }
  return max(w, baseWidth * (1.0 - smoothstep(0.0, wp, u)));
}

// Template rows crowd toward both ends so rounded tips and bases stay smooth.
export fn sheetU(g: f32) -> f32 {
  return mix(g, 0.5 - 0.5 * cos(g * PI), 0.6);
}

// Blade point in its own frame: x across, y along the length, z out of the front face.
fn sheetLocal(u: f32, v: f32, len: f32, width: f32, cup: f32, bend: vec4f, outline: vec4f, baseWidth: f32, seed: f32) -> vec3f {
  let curl = bend.x;
  let tipCurl = bend.y;
  // Centerline: integrate the bend angle along the length.
  var y = 0.0;
  var z = 0.0;
  let du = u / 6.0;
  for (var i = 0; i < 6; i++) {
    let m = (f32(i) + 0.5) * du;
    let th = curl * m + tipCurl * m * m * m;
    y += cos(th) * du;
    z += sin(th) * du;
  }
  let th = curl * u + tipCurl * u * u * u;
  let normal0 = vec3f(0.0, -sin(th), cos(th));
  let tw = bend.z * u;
  let across = vec3f(cos(tw), 0.0, 0.0) + normal0 * sin(tw);
  let normal = normal0 * cos(tw) - vec3f(sin(tw), 0.0, 0.0);

  let hw = 0.5 * width * sheetProfile(u, outline.y, outline.z, baseWidth);
  var lift = cup * hw * v * v;
  // Ruffles live only near the margin, so the blade itself stays a smooth,
  // fleshy cupped surface.
  let edge = smoothstep(0.45, 1.0, abs(v));
  let wave = sin(u * outline.x * TAU + seed * 31.0 + v * 1.7) * 0.65 + sin(u * outline.x * 13.1 + seed * 17.0 - v * 2.3) * 0.35;
  lift += bend.w * hw * edge * edge * wave * smoothstep(0.0, 0.25, u) * 1.3;
  return vec3f(0.0, y * len, z * len) + across * (v * hw) + normal * lift;
}

// i0 = origin, length; i1 = dir, width; i2 = normal, cup; i3 = bend; i4 = outline; i6.z = base width.
export fn sheetSurface(u: f32, v: f32, i0: vec4f, i1: vec4f, i2: vec4f, i3: vec4f, i4: vec4f, i6: vec4f, seed: f32) -> Surface {
  let dir = normalize(i1.xyz);
  let front = normalize(i2.xyz);
  let side = normalize(cross(dir, front));
  let p = sheetLocal(u, v, i0.w, i1.w, i2.w, i3, i4, i6.z, seed);
  // Normal from finite differences, kept inside the blade.
  let e = 0.012;
  let uc = clamp(u, e, 1.0 - e);
  let vc = clamp(v, -1.0 + e * 2.0, 1.0 - e * 2.0);
  let du = sheetLocal(uc + e, vc, i0.w, i1.w, i2.w, i3, i4, i6.z, seed) - sheetLocal(uc - e, vc, i0.w, i1.w, i2.w, i3, i4, i6.z, seed);
  let dv = sheetLocal(uc, vc + e * 2.0, i0.w, i1.w, i2.w, i3, i4, i6.z, seed) - sheetLocal(uc, vc - e * 2.0, i0.w, i1.w, i2.w, i3, i4, i6.z, seed);
  var n = cross(dv, du);
  if (dot(n, n) < 1e-14) {
    n = vec3f(0.0, 0.0, 1.0);
  }
  n = normalize(n);
  var out: Surface;
  out.position = i0.xyz + side * p.x + dir * p.y + front * p.z;
  out.normal = normalize(side * n.x + dir * n.y + front * n.z);
  return out;
}

// ---------------------------------------------------------------- tubes

fn bezier(p0: vec3f, p1: vec3f, p2: vec3f, p3: vec3f, t: f32) -> vec3f {
  let s = 1.0 - t;
  return p0 * (s * s * s) + p1 * (3.0 * s * s * t) + p2 * (3.0 * s * t * t) + p3 * (t * t * t);
}

fn bezierTangent(p0: vec3f, p1: vec3f, p2: vec3f, p3: vec3f, t: f32) -> vec3f {
  let s = 1.0 - t;
  let d = (p1 - p0) * (3.0 * s * s) + (p2 - p1) * (6.0 * s * t) + (p3 - p2) * (3.0 * t * t);
  return select(normalize(p3 - p0 + vec3f(0.0, 1e-6, 0.0)), normalize(d), dot(d, d) > 1e-14);
}

// i0..i3 = Bézier points with r0 = i0.w, r1 = i1.w. `a` runs once around (0..1).
export fn tubeSurface(u: f32, a: f32, i0: vec4f, i1: vec4f, i2: vec4f, i3: vec4f) -> Surface {
  let p0 = i0.xyz;
  let p1 = i1.xyz;
  let p2 = i2.xyz;
  let p3 = i3.xyz;
  let chord = p3 - p0;
  // The curve's own plane gives a twist-free frame for planar bends.
  var plane = cross(chord, (p1 + p2) * 0.5 - p0);
  if (dot(plane, plane) < 1e-10 * max(dot(chord, chord), 1e-8)) {
    let c = normalize(chord + vec3f(0.0, 1e-6, 0.0));
    plane = cross(c, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(c.y) > 0.9));
  }
  plane = normalize(plane);
  let t = bezierTangent(p0, p1, p2, p3, u);
  var side = cross(t, plane);
  if (dot(side, side) < 1e-8) {
    side = cross(t, vec3f(0.0, 0.0, 1.0));
  }
  side = normalize(side);
  let bin = cross(side, t);
  let ang = a * TAU;
  let radial = side * cos(ang) + bin * sin(ang);
  let r = mix(i0.w, i1.w, u);
  var out: Surface;
  out.position = bezier(p0, p1, p2, p3, u) + radial * r;
  out.normal = radial;
  return out;
}

// ---------------------------------------------------------------- blobs

fn blobLocal(theta: f32, phi: f32, radii: vec3f, shape: vec4f, seed: f32) -> vec3f {
  let c = cos(theta);
  let s = sin(theta);
  let sq = max(shape.z, 0.2);
  let y = sign(c) * pow(max(abs(c), 1e-5), sq) * radii.y;
  let hr = pow(max(abs(s), 1e-5), sq);
  var rib = 1.0;
  if (shape.x > 0.5) {
    rib = 1.0 - shape.y * (1.0 - pow(abs(cos(shape.x * phi * 0.5)), 1.5));
  }
  let bump = 1.0 + shape.w * 0.12 * (valueNoise(vec2f(theta * 6.0 + seed * 10.0, phi * 5.0 + seed * 3.0)) - 0.5);
  return vec3f(hr * cos(phi) * radii.x * rib, y, hr * sin(phi) * radii.z * rib) * bump;
}

// i0 = center, rx; i1 = up, ry; i2 = front, rz; i3 = ribs, rib depth, squareness, bumps.
// `t` runs pole to pole (0..1), `a` once around (0..1).
export fn blobSurface(t: f32, a: f32, i0: vec4f, i1: vec4f, i2: vec4f, i3: vec4f, seed: f32) -> Surface {
  let up = normalize(i1.xyz);
  let front = normalize(i2.xyz);
  let right = normalize(cross(up, front));
  let radii = vec3f(i0.w, i1.w, i2.w);
  let theta = t * PI;
  let phi = a * TAU;
  let p = blobLocal(theta, phi, radii, i3, seed);
  let e = 0.012;
  let tc = clamp(theta, e, PI - e);
  let dt = blobLocal(tc + e, phi, radii, i3, seed) - blobLocal(tc - e, phi, radii, i3, seed);
  let dp = blobLocal(tc, phi + e, radii, i3, seed) - blobLocal(tc, phi - e, radii, i3, seed);
  var n = cross(dp, dt);
  if (dot(n, n) < 1e-16) {
    n = p / max(radii * radii, vec3f(1e-8));
  }
  n = normalize(n);
  var out: Surface;
  out.position = i0.xyz + right * p.x + up * p.y + front * p.z;
  out.normal = normalize(right * n.x + up * n.y + front * n.z);
  return out;
}

// ---------------------------------------------------------------- wind

// Gentle sway that grows with height up the plant. anchor = base xyz, height.
export fn sway(p: vec3f, anchor: vec4f, phase: f32, time: f32, amount: f32) -> vec3f {
  let h = clamp((p.y - anchor.y) / max(anchor.w, 0.05), 0.0, 1.3);
  let gust = sin(time * 1.15 + anchor.x * 0.35 + anchor.z * 0.2 + phase * TAU) * 0.6
    + sin(time * 2.6 + phase * 17.0) * 0.22
    + sin(time * 0.45 + anchor.x * 0.1) * 0.3;
  let flutter = sin(time * 1.7 + phase * 9.0) * 0.25;
  return vec3f(gust, 0.0, gust * 0.35 + flutter) * amount * 0.05 * anchor.w * h * h;
}
