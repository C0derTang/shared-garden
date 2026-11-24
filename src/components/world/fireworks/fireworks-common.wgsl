// Shared records of the night fireworks. Pure module: no bindings.
// Must match SPARK_FLOATS / SHELL_FLOATS and packFireworks in src/lib/world/fireworks.ts.

// One particle, written once per show by the CPU.
export struct Spark {
  // Rockets: the launch base. Other sparks: where they are born.
  origin: vec3f,
  // Show seconds when the spark is born.
  spawn: f32,
  // Rockets: the burst point. Other sparks: the initial velocity.
  velocity: vec3f,
  // Seconds it lives (rockets: the flight time).
  life: f32,
  color: vec3f,
  // Half width of its streak (world units).
  size: f32,
  // 0 rocket, 1 launch-trail spark, 2 star, 3 comet, 4 willow, 5 crackle.
  kind: f32,
  // Air drag (1 / s).
  drag: f32,
  // Seconds of motion its streak shows behind it.
  trail: f32,
  seed: f32,
  // Multiplier of the world's spark gravity.
  gravity: f32,
  // 0..1 glitter: late twinkling flashes.
  flicker: f32,
  // The colour it drifts toward as it burns (8 bits per channel, see unpackColor).
  fade: f32,
  // Fraction of its life when the drift begins (> 1: never).
  shift: f32,
}

// The simulated state of a particle (age < 0: not alive).
export struct SparkState {
  position: vec3f,
  age: f32,
  velocity: vec3f,
  heat: f32,
}

// One shell's burst, for its glow in the sky.
export struct Shell {
  burst: vec3f,
  // Show seconds of the burst.
  time: f32,
  color: vec3f,
  radius: f32,
  brightness: f32,
  willow: f32,
  // Packed colour its smoke cools toward (see unpackColor).
  fade: f32,
  pad: f32,
}

export const KIND_ROCKET: f32 = 0.0;
export const KIND_TRAIL: f32 = 1.0;
export const KIND_STAR: f32 = 2.0;
export const KIND_COMET: f32 = 3.0;
export const KIND_WILLOW: f32 = 4.0;
export const KIND_CRACKLE: f32 = 5.0;

// Must match rocketPosition() in src/lib/world/fireworks.ts.
export fn rocketPosition(base: vec3f, burst: vec3f, launch: f32, flight: f32, t: f32) -> vec3f {
  let u = clamp(t / flight, 0.0, 1.0);
  let lift = 1.0 - (1.0 - u) * (1.0 - u);
  let weave = sin(u * 9.0 + launch * 3.0) * 0.12 * u;
  return base + (burst - base) * lift + vec3f(weave, 0.0, 0.0);
}

export fn sparkHash(x: f32) -> f32 {
  return fract(sin(x * 127.1 + 311.7) * 43758.5453);
}

// Must match packColor() in src/lib/world/fireworks.ts.
export fn unpackColor(packed: f32) -> vec3f {
  let v = u32(max(packed, 0.0) + 0.5);
  return vec3f(f32((v >> 16u) & 255u), f32((v >> 8u) & 255u), f32(v & 255u)) / 255.0;
}
