/**
 * One shared rule for how brightly every plot glows in the painted world
 * (#206): empty seed marks and every flower's soft aura, at every stage and
 * type, use the same resting level, the same hover/selected boost and the same
 * halo profile, scaled by the scene's exposure so night does not over-glow and
 * day does not vanish.
 */

import type { WorldLighting } from "./sky-palette";

export type Rgb = readonly [number, number, number];

export const PLOT_GLOW = {
  /** Displayed peak of a resting glow (linear light, after exposure) in daylight. */
  base: 0.38,
  /** How much a plot's glow brightens under the pointer or when selected. */
  hoverBoost: 2.1,
  /** How much its halo widens then. */
  hoverGrow: 1.35,
  /** How much quieter the displayed glow is in full night (a dark meadow makes any glow read stronger). */
  nightEase: 0.45,
  /** Linear luminance every glow colour is normalised to, so no hue reads brighter than another. */
  luminance: 0.55,
  /**
   * How far every glow colour is softened toward white first: saturated hues
   * look brighter than their luminance (a deep blue halo flares), so glows
   * stay pastel and read alike.
   */
  soften: 0.4,
  /** Brightest channel a normalised colour may reach before it is softened toward white. */
  channelLimit: 1.35,
  /** World radius band of every plot's halo, from an empty seed mark to a full bloom. */
  minRadius: 0.17,
  maxRadius: 0.27,
} as const;

/** Linear luminance (Rec. 709). */
export function luminance(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** The scene's exposure before tone mapping (shared with the painterly composite). */
export function sceneExposure(lighting: Pick<WorldLighting, "glow" | "night">): number {
  return 0.8 + lighting.glow * 0.2 + lighting.night * 0.55;
}

/**
 * The glow level every plot shares for this sky, before exposure. Multiply by
 * a normalised colour (luminance {@link PLOT_GLOW.luminance}) and the halo
 * profile (peak 1) to get the additive radiance; after the scene's exposure
 * its displayed peak is {@link PLOT_GLOW.base}, eased in the dark.
 */
export function plotGlowLevel(lighting: Pick<WorldLighting, "glow" | "night">): number {
  const backdrop = 1 - PLOT_GLOW.nightEase * Math.min(1, Math.max(0, lighting.night));
  return (PLOT_GLOW.base * backdrop) / (PLOT_GLOW.luminance * sceneExposure(lighting));
}

/**
 * A glow colour with the shared luminance, keeping its hue (softened toward
 * white by {@link PLOT_GLOW.soften}). Deep colours that
 * would need a channel above {@link PLOT_GLOW.channelLimit} are softened toward
 * white instead, so they keep the same luminance.
 */
export function evenGlowColor(rgb: Rgb): Rgb {
  const target = PLOT_GLOW.luminance;
  const grey = luminance(rgb);
  if (!(grey > 1e-5)) return [target, target, target];
  const soft = PLOT_GLOW.soften;
  const pastel: Rgb = [rgb[0] + (grey - rgb[0]) * soft, rgb[1] + (grey - rgb[1]) * soft, rgb[2] + (grey - rgb[2]) * soft];
  const lum = luminance(pastel);
  const peak = Math.max(pastel[0], pastel[1], pastel[2]);
  // Scale to the target luminance; past the channel limit, mix in just enough white instead.
  let k = target / lum;
  let white = 0;
  if (peak * k > PLOT_GLOW.channelLimit) {
    k = (PLOT_GLOW.channelLimit - target) / (peak - lum);
    white = target - k * lum;
  }
  return [pastel[0] * k + white, pastel[1] * k + white, pastel[2] * k + white];
}

/** A plot halo's world radius, kept within the shared band. */
export function evenGlowRadius(radius: number): number {
  return Math.min(PLOT_GLOW.maxRadius, Math.max(PLOT_GLOW.minRadius, Number.isFinite(radius) ? radius : PLOT_GLOW.minRadius));
}

/** The warm colour of an empty seed mark's glow (normalised). */
export const SEED_GLOW: Rgb = evenGlowColor([1, 0.8, 0.46]);
/** A seedling's glow: the seed mark's warmth with a little fresh green. */
export const SPROUT_GLOW: Rgb = evenGlowColor([0.86, 0.92, 0.42]);
