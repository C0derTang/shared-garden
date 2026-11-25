/**
 * The garden composition's camera without its idle drift and pointer
 * parallax: the scroll journey, the sideways walk, the plot navigator's bed
 * framing and the glide to a flower, blended in that order. The renderer adds
 * the drift on top; tests use it to know where every plot lands on screen.
 */

import { lookAt, multiply, perspective } from "./camera";
import { blendPoses, focusPose, journeyPose, type FocusTarget, type JourneyPose } from "./journey";
import type { Vec3 } from "./layout";

const DEG = Math.PI / 180;

/** Vertical field of view: wider on narrow screens so the garden keeps its width. */
export function gardenFovY(aspect: number): number {
  return Math.min(68 * DEG, Math.max(38 * DEG, 2 * Math.atan(Math.tan(24 * DEG) / Math.max(aspect, 0.01))));
}

/** Portrait screens tilt the overview down a little so the garden, not the sky, fills the frame. */
export function portraitTilt(aspect: number): number {
  return (1 - Math.min(aspect, 1)) * 7;
}

export interface GardenCameraState {
  /** Scroll journey, 0 (overview) .. 1 (among the beds). */
  readonly journey: number;
  /** Sideways walk along the beds (world units). */
  readonly pan: number;
  /** The navigator's framing of the selected plot's bed, and how far the camera has blended into it. */
  readonly browse?: JourneyPose | null;
  readonly browseWeight?: number;
  /** A flower the camera glides close to before its view opens, and how far it has glided. */
  readonly focus?: FocusTarget | null;
  readonly focusWeight?: number;
}

/** Camera pose for a state, before drift and parallax. */
export function gardenPose(state: GardenCameraState, aspect: number, fovY: number): JourneyPose {
  const walked = journeyPose(state.journey);
  let pose: JourneyPose = {
    eye: [walked.eye[0] + state.pan, walked.eye[1], walked.eye[2]],
    look: [walked.look[0] + state.pan, walked.look[1], walked.look[2]],
  };
  const browse = state.browse && state.browseWeight ? Math.min(1, Math.max(0, state.browseWeight)) : 0;
  if (state.browse && browse > 0) pose = blendPoses(pose, state.browse, browse);
  const focus = state.focus && state.focusWeight ? Math.min(1, Math.max(0, state.focusWeight)) : 0;
  if (state.focus && focus > 0) pose = blendPoses(pose, focusPose(state.focus, aspect, fovY), focus);
  const tilt = portraitTilt(aspect) * (1 - focus) * (1 - browse);
  return { eye: pose.eye, look: [pose.look[0], pose.look[1] - tilt, pose.look[2]] };
}

/**
 * How much of the idle drift and pointer parallax stays: all of it in the
 * open, none once glided close to a flower, and 30% while the navigator frames
 * a plot (so the selected plot stays put under the pointer).
 */
export function gardenSettle(focusWeight: number, browseWeight: number): number {
  return (1 - focusWeight) * (1 - 0.7 * browseWeight);
}

/**
 * The idle drift the renderer adds to a pose at animation time `t`, scaled by
 * `settle`. Reduced motion freezes `t` at 0, which still leaves a small fixed
 * sideways lean of the look point (sin(1) × 0.1 × settle).
 */
export function idleDrift(t: number, settle: number): JourneyPose {
  return {
    eye: [Math.sin(t * 0.11) * 0.25 * settle, Math.sin(t * 0.07) * 0.06 * settle, 0],
    look: [Math.sin(t * 0.09 + 1) * 0.1 * settle, 0, 0],
  };
}

/** A pose with the idle drift added (as the renderer paints it, before pointer parallax). */
export function withDrift(pose: JourneyPose, t: number, settle: number): JourneyPose {
  const drift = idleDrift(t, settle);
  return {
    eye: [pose.eye[0] + drift.eye[0], pose.eye[1] + drift.eye[1], pose.eye[2] + drift.eye[2]],
    look: [pose.look[0] + drift.look[0], pose.look[1] + drift.look[1], pose.look[2] + drift.look[2]],
  };
}

/** View-projection of the garden camera for a canvas of `width` × `height` with the given eye and look. */
export function gardenViewProjection(width: number, height: number, pose: JourneyPose): Float32Array {
  const aspect = width / Math.max(height, 1);
  const projection = perspective(gardenFovY(aspect), aspect, 0.1, 420);
  return multiply(projection, lookAt(pose.eye as Vec3, pose.look as Vec3, [0, 1, 0]));
}
