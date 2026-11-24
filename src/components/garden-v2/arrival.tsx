"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { WorldStatus } from "@/components/world/garden-world";
import type { WorldView } from "@/components/world/renderer";
import { useSheetScope } from "@/components/ui/sheet-scope";
import warm from "@/components/world/warm-light.module.css";
import { clearGardenArrival, readGardenArrival } from "@/lib/garden-v2/arrival";
import { arrivalLightOpacity, arrivalStage } from "@/lib/world/arrival";
import styles from "./arrival.module.css";

/** Gives up waiting for the painted world after this long (ms) and fades the light anyway. */
export const ARRIVAL_SAFETY_MS = 9000;
/** The fallback fade out of the light (ms), e.g. without WebGPU or after the safety delay. */
export const ARRIVAL_FALLBACK_FADE_MS = 700;
/**
 * After the arrival ends, sheets held in the sheet scope (a pending private
 * moment) get their turn first; the guide, hint, fireworks and away note wait
 * this much longer (ms), so a waiting moment is open before the guide looks.
 */
export const ARRIVAL_SETTLE_GAP_MS = 150;
/** The arrival's place at the head of the sheet scope while it plays. */
const ARRIVAL_SLOT = "garden-arrival";

/**
 * - `hold`: the warm light covers everything while the world gets ready.
 * - `light`: the light thins away as the camera arrives.
 * - `chrome`: the title, words and menu fade in.
 * - `fading`: a fallback fade out of the light (no painted world).
 * - `done`: settled; the light is gone, and the guide and fireworks may begin.
 */
export type ArrivalPhase = "hold" | "light" | "chrome" | "fading" | "done";

export interface GardenArrival {
  readonly phase: ArrivalPhase;
  /** The arrival is over (or there was none): greetings, hints and fireworks may begin. */
  readonly settled: boolean;
  /** For `GardenWorld`'s `arrival`. */
  readonly world: "hold" | "play" | null;
  /** For `GardenWorld`'s `onView`: follows the arrival frame by frame. */
  readonly onView: (view: WorldView) => void;
  /** Hides or fades in the page's words and menu around the arrival. */
  readonly chromeClassName: string;
  readonly lightRef: RefObject<HTMLDivElement | null>;
}

const subscribeNever = () => () => {};

/**
 * The garden's arrival after the landing's walk through the door (#204). Only
 * when the landing marked it (and the page was opened without a flower or
 * overlay link): the page opens under the same warm light, holds it until the
 * painted world and its flowers are ready, then reveals the garden as the
 * camera arrives. Anything else opens the garden exactly as before.
 */
export function useGardenArrival({
  allowed,
  worldStatus,
  layersLoaded,
  reducedMotion,
}: {
  /** False when the page was opened for a flower or an overlay. */
  allowed: boolean;
  worldStatus: WorldStatus;
  /** The page's own world layers (the flowers) have loaded their code. */
  layersLoaded: boolean;
  reducedMotion: boolean;
}): GardenArrival {
  // A client navigation renders fresh (true at once); a server-rendered page
  // hydrates first (false), so the first render always matches the server's.
  const fresh = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [phase, setPhase] = useState<ArrivalPhase>(() => (allowed && fresh && readGardenArrival() ? "hold" : "done"));
  const [enabled] = useState(() => phase !== "done");
  const lightRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef(phase);
  const opacity = useRef(1);
  const motion = useRef(reducedMotion);
  useEffect(() => {
    phaseRef.current = phase;
    motion.current = reducedMotion;
  });

  // The mark is used up whether or not it applied (a refresh never replays the arrival).
  useEffect(() => clearGardenArrival(), []);

  // While the arrival plays, it holds the sheet scope: a pending private moment
  // (or any other scoped sheet) waits and opens only once the garden has settled.
  const scope = useSheetScope();
  const request = scope?.request;
  const release = scope?.release;
  const holding = phase !== "done";
  useEffect(() => {
    if (!holding) return;
    request?.(ARRIVAL_SLOT);
    return () => release?.(ARRIVAL_SLOT);
  }, [holding, request, release]);
  const [settled, setSettled] = useState(!enabled);
  useEffect(() => {
    if (phase !== "done" || settled) return;
    const id = window.setTimeout(() => setSettled(true), ARRIVAL_SETTLE_GAP_MS);
    return () => window.clearTimeout(id);
  }, [phase, settled]);

  const ready = worldStatus === "ready" && layersLoaded;
  useEffect(() => {
    if (phase !== "hold") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the world reports readiness from the GPU
    if (ready) setPhase("light");
    else if (worldStatus === "unsupported" || worldStatus === "stopped") setPhase("fading");
  }, [phase, ready, worldStatus]);

  // Never strand the light: without a painted world, fade it anyway.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => {
      if (phaseRef.current === "hold" || (phaseRef.current === "light" && opacity.current >= 1)) setPhase("fading");
    }, ARRIVAL_SAFETY_MS);
    return () => window.clearTimeout(id);
  }, [enabled]);

  useEffect(() => {
    if (phase !== "fading") return;
    const light = lightRef.current;
    if (light) {
      light.style.transition = `opacity ${ARRIVAL_FALLBACK_FADE_MS}ms ease`;
      light.style.opacity = "0";
    }
    const id = window.setTimeout(() => setPhase("done"), ARRIVAL_FALLBACK_FADE_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  const onView = useCallback((view: WorldView) => {
    const current = phaseRef.current;
    if (current !== "light" && current !== "chrome") return;
    if (view.arrival === null) {
      // The world settled (or never had an arrival): nothing left to reveal.
      opacity.current = 0;
      setPhase("done");
      return;
    }
    const still = motion.current;
    // Only ever thins (a recreated GPU context restarts its own clock).
    const next = Math.min(opacity.current, arrivalLightOpacity(view.arrival, still));
    if (next !== opacity.current) {
      opacity.current = next;
      if (lightRef.current) lightRef.current.style.opacity = next.toFixed(3);
    }
    const stage = arrivalStage(view.arrival, still);
    if (stage === "settled") setPhase("done");
    else if (stage === "chrome" && current === "light") setPhase("chrome");
  }, []);

  const chromeClassName = phase === "hold" || phase === "light" ? styles.chromeHidden : phase === "chrome" || phase === "fading" ? styles.chromeShowing : "";
  return {
    phase,
    settled,
    // Only while the arrival is under way: a renderer created later (after a
    // device loss, or a world that turns up after the fallback) never replays it.
    world: !enabled ? null : phase === "hold" ? "hold" : phase === "light" || phase === "chrome" ? "play" : null,
    onView,
    chromeClassName,
    lightRef,
  };
}

/** The warm light the garden opens under after the walk-through. */
export function ArrivalLight({ phase, lightRef }: { phase: ArrivalPhase; lightRef: RefObject<HTMLDivElement | null> }) {
  if (phase === "done") return null;
  return <div ref={lightRef} className={`${styles.light} ${warm.warmLight}`} data-arrival-light={phase} aria-hidden="true" />;
}
