// Shared records of a dandelion's seeds blowing away (#201). Pure module: no
// bindings. Must match DRIFT_SEED_FLOATS / DRIFT_STATE_FLOATS and
// packSeedDrift in src/lib/world/flowers/seed-drift.ts.

// One seed, written once per blow by the CPU. Positions are world space at
// rest (where the seed puff painted it); offsets run along the seed's axis.
export struct DriftSeed {
  // Pappus centre (the seed's pivot) and the drift-clock second it lets go.
  pivot: vec4f,
  // Unit axis out of the head through the seed; flight seconds after letting go.
  axis: vec4f,
  // Unit front of the pappus; seconds the seed takes to catch the breeze.
  front: vec4f,
  // Breeze velocity; how fast it rises once aloft.
  wind: vec4f,
  // The plant's stem base and height (for its sway while still attached).
  anchor: vec4f,
  // Sway phase, spin about its own axis (rad/s), tumble strength, mode (0 off, 1 drift, 2 fade in place).
  motion: vec4f,
  // Achene radii, and its offset along the axis from the pivot.
  acheneShape: vec4f,
  // Achene base colour, part seed.
  acheneBase: vec4f,
  // Achene tip colour, the beak's foot offset along the axis.
  acheneTip: vec4f,
  // Beak radii at its foot and tip, beak part seed, pappus part seed.
  beakShape: vec4f,
  // Beak base colour, pappus translucency.
  beakBase: vec4f,
  // Beak tip colour, pappus glow.
  beakTip: vec4f,
  // Pappus radii, the outward push as it lets go.
  pappusShape: vec4f,
  // Pappus base colour, a random in [0, 1).
  pappusBase: vec4f,
  // Pappus tip colour, achene translucency.
  pappusTip: vec4f,
  // Turbulence, the flower's placement scale, unused, unused.
  extra: vec4f,
}

// The simulated state of a seed.
export struct DriftState {
  // Pivot position; the release second this state belongs to (a new blow resets it).
  position: vec4f,
  // Velocity; seconds since letting go (< 0 while still attached).
  velocity: vec4f,
  // Rotation from the rest pose (unit quaternion xyzw).
  rotation: vec4f,
  // Angular velocity (rad/s); opacity (0 once faded).
  spin: vec4f,
}

export const MODE_OFF: f32 = 0.0;
export const MODE_DRIFT: f32 = 1.0;
export const MODE_STILL: f32 = 2.0;

// Rotates `v` by unit quaternion `q`.
export fn qrotate(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// q * r (Hamilton product, xyzw).
export fn qmul(q: vec4f, r: vec4f) -> vec4f {
  return vec4f(q.w * r.xyz + r.w * q.xyz + cross(q.xyz, r.xyz), q.w * r.w - dot(q.xyz, r.xyz));
}
