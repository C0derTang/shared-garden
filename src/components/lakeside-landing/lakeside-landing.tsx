"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { DOOR_CAPTION } from "@/lib/world/landing-frame";
import { markGardenArrival } from "@/lib/garden-v2/arrival";
import { legacyPath } from "@/lib/legacy/routes";
import { GardenWorld, usePrefersReducedMotion, type WorldCaption, type WorldStatus } from "@/components/world/garden-world";
import { handFont } from "@/components/world/hand-font";
import type { WorldView } from "@/components/world/renderer";
import warm from "@/components/world/warm-light.module.css";
import styles from "./lakeside-landing.module.css";

/** Where members go when they walk through the door. */
export const GARDEN_PATH = "/garden";
/** Reduced-motion crossfade into the house, in milliseconds. */
export const CROSSFADE_MS = 450;
/** Navigates anyway if the walk-through never reports its end (e.g. a backgrounded tab). */
export const WALK_SAFETY_MS = 7000;

type Phase = "idle" | "walking" | "fading" | "leaving";

/**
 * Loads the garden's own world code (its flowers and night sky layers) ahead
 * of time, so it is cached before the walk-through ends. The GPU work itself
 * belongs to the garden's page and starts when it opens.
 */
export function warmGarden(): void {
  void import("@/components/world/flowers/flower-layer").catch(() => {});
  void import("@/components/world/fireworks/fireworks-layer").catch(() => {});
}

export interface LakesideLandingProps {
  /** A verified member of the garden (the server decides). */
  readonly member: boolean;
  /** Fixed sky time for previews; the live Los Angeles clock otherwise. */
  readonly time?: Date;
}

const SCENE_LABEL = "A painted wooden house with a stone chimney and a red front door, in a forest beside a lake";

/**
 * The landing: a painted lakeside house in the forest. Visitors see the scene
 * and a handwritten "log in" (a plain POST form to /auth/start). Members see
 * the door glow with "come in"; tapping the door or the words walks up the
 * path, opens the door and pushes through into the light, then opens the
 * garden. Reduced motion swaps the walk for a short crossfade.
 */
export function LakesideLanding({ member, time }: LakesideLandingProps) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<WorldStatus>("loading");
  const lightRef = useRef<HTMLDivElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    if (member) router.prefetch(GARDEN_PATH);
  }, [member, router]);

  // Once the house is painted, quietly fetch the garden's world code too.
  const warmed = useRef(false);
  useEffect(() => {
    if (!member || status !== "ready" || warmed.current) return;
    warmed.current = true;
    warmGarden();
  }, [member, status]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  const move = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const leave = () => {
    if (phaseRef.current === "leaving") return;
    move("leaving");
    if (lightRef.current) lightRef.current.style.opacity = "1";
    // The garden opens under this same light and reveals itself when ready (#204).
    markGardenArrival();
    router.push(GARDEN_PATH);
  };

  const enter = () => {
    if (!member || phaseRef.current !== "idle") return;
    if (!warmed.current) {
      warmed.current = true;
      warmGarden();
    }
    if (reducedMotion || status !== "ready") {
      move("fading");
      timers.current.push(window.setTimeout(leave, CROSSFADE_MS));
      return;
    }
    move("walking");
    timers.current.push(window.setTimeout(leave, WALK_SAFETY_MS));
  };

  const onView = (view: WorldView) => {
    if (phaseRef.current === "walking" && lightRef.current) lightRef.current.style.opacity = view.entryFade.toFixed(3);
  };

  const captions: WorldCaption[] = useMemo(() => {
    if (phase !== "idle") return [];
    if (!member) return [{ id: "log-in", text: "log in", position: DOOR_CAPTION, formAction: "/auth/start", standby: true }];
    // A real link to the garden (works before scripts run); a plain click plays the walk-through.
    return [{ id: "come-in", text: "come in", position: DOOR_CAPTION, href: GARDEN_PATH, onSelect: enter, standby: true }];
    // `enter` reads the latest state through refs and the current render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member, phase, status, reducedMotion]);

  const notice = (worldStatus: "unsupported" | "stopped") => (
    <div className={styles.notice} role={worldStatus === "stopped" ? "alert" : "status"}>
      <p className={styles.noticeTitle}>{worldStatus === "stopped" ? "The painting stopped." : "This house is painted with WebGPU."}</p>
      <p className={styles.noticeText}>
        {worldStatus === "stopped"
          ? "Something interrupted the graphics. Reloading usually brings it back."
          : "Your browser can’t show it yet. Try a recent Chrome, Edge or Safari."}
      </p>
      <div className={styles.noticeActions}>
        {member ? (
          <>
            <Link className={styles.noticeLink} href={GARDEN_PATH}>
              come in
            </Link>
            <Link className={styles.noticeLink} href={legacyPath}>
              old garden
            </Link>
          </>
        ) : (
          <form action="/auth/start" method="post">
            <button type="submit" className={styles.noticeLink}>
              log in
            </button>
          </form>
        )}
        {worldStatus === "stopped" && (
          <button type="button" className={styles.noticeLink} onClick={() => window.location.reload()}>
            reload
          </button>
        )}
      </div>
    </div>
  );

  return (
    <main id="main-content" className={`${styles.landing} ${handFont.className}`} data-phase={phase}>
      <GardenWorld
        composition="landing"
        className={styles.world}
        label={SCENE_LABEL}
        time={time}
        captions={captions}
        doorInvite={member && phase === "idle"}
        entering={phase === "walking"}
        onPickDoor={enter}
        onEntered={leave}
        onView={onView}
        onStatusChange={setStatus}
        notice={notice}
      />
      {member && phase === "idle" && status !== "unsupported" && status !== "stopped" && (
        <Link className={styles.corner} href={legacyPath}>
          old garden
        </Link>
      )}
      <div ref={lightRef} className={`${styles.light} ${warm.warmLight}`} aria-hidden="true" />
      <p className={styles.announce} aria-live="polite">
        {phase === "idle" ? "" : "Opening the door. Walking into the garden…"}
      </p>
    </main>
  );
}
