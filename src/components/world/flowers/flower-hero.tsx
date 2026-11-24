"use client";

import { useMemo, useRef } from "react";
import { flowerPhase, type FlowerModel, type FlowerSpec, type PlacedFlower } from "@/lib/world/flowers/generate";
import { flowerModel } from "./flower-models";
import type { StudioCamera, StudioState } from "./studio-renderer";
import { usePrefersReducedMotion, useStudio } from "./use-studio";
import styles from "./flower-studio.module.css";

/** Slow orbit: about 40 seconds per turn. */
const HERO_SPIN = 0.16;

export type HeroFraming = "plant" | "bloom";

/**
 * Camera that keeps the plant large in frame, slightly from above: the whole
 * plant, or a close-up of its bloom (falls back to the plant before a head forms).
 */
export function heroCamera(model: FlowerModel, framing: HeroFraming = "plant"): StudioCamera {
  const fovY = (30 * Math.PI) / 180;
  const aura = model.aura;
  if (framing === "bloom" && aura) {
    const extent = Math.max(aura.radius * 0.55, 0.05);
    return { kind: "orbit", target: aura.center, distance: extent / Math.tan(fovY / 2), elevation: (18 * Math.PI) / 180, fovY, spin: HERO_SPIN };
  }
  const extent = Math.max(model.height * 0.56, model.radius * 1.25, 0.08);
  return {
    kind: "orbit",
    target: [0, model.height * 0.54, 0],
    distance: extent / Math.tan(fovY / 2),
    elevation: (10 * Math.PI) / 180,
    fovY,
    spin: HERO_SPIN,
  };
}

export interface FlowerHeroProps {
  readonly spec: FlowerSpec;
  /** Sky time that sets the light's colour (moonflowers glow at night); the live clock otherwise. */
  readonly time?: Date;
  readonly className?: string;
  /** Accessible description, e.g. "Rose in bloom". */
  readonly label?: string;
  /** Whole plant (default) or a close-up of the bloom. */
  readonly framing?: HeroFraming;
}

/**
 * Hero render mode: one procedural flower, large and lit like a botanical
 * plate, slowly turning, with its soft coloured aura. For the flower detail
 * split view. Motion stops under reduced motion. Requires WebGPU.
 */
export function FlowerHero({ spec, time, className, label, framing = "plant" }: FlowerHeroProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const key = `${spec.type}|${spec.seed}|${spec.growth}|${spec.puff ? 1 : 0}|${(spec.moodColors ?? []).join(",")}`;
  const timeValue = time?.getTime() ?? null;
  const state: StudioState = useMemo(() => {
    const model = flowerModel(spec);
    const flowers: PlacedFlower[] = [{ model, placement: { position: [0, 0, 0], yaw: 0, scale: 1 }, phase: flowerPhase(spec.seed) }];
    return { flowers, camera: heroCamera(model, framing), time: timeValue === null ? null : new Date(timeValue), reducedMotion, aura: 0.3, sway: 0.5 };
    // `key` captures every field of `spec`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, timeValue, reducedMotion, framing]);
  const status = useStudio(canvasRef, state);
  const classes = [styles.studio, className].filter(Boolean).join(" ");
  const description = label ?? `A painted ${spec.type.replace(/-/g, " ")}`;
  if (status === "unsupported" || status === "stopped") {
    return (
      <div className={classes} data-status={status}>
        <p className={styles.notice} role="status">
          {status === "unsupported" ? "This flower is painted with WebGPU, which this browser can’t show yet." : "The painted flower stopped. Reloading usually brings it back."}
        </p>
      </div>
    );
  }
  return (
    <div className={classes} data-status={status}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={description} />
    </div>
  );
}
