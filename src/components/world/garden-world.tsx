"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { projectToNdc } from "@/lib/world/camera";
import { SPOTS_PER_BED, type Vec3 } from "@/lib/world/layout";
import type { FlowerAnchor } from "@/lib/world/picking";
import { handFont } from "./hand-font";
import type { WorldComposition, WorldRenderer, WorldSceneState, WorldView } from "./renderer";
import type { WorldLayer } from "./world-layer";
import styles from "./garden-world.module.css";

/** Handwritten text floating in the world, anchored to a world position. */
export interface WorldCaption {
  readonly id: string;
  readonly text: string;
  readonly position: Vec3;
  /** "title" is large display type; "label" is small. */
  readonly size?: "title" | "label";
  /** Makes the caption a button. */
  readonly onSelect?: () => void;
  /** Makes the caption a submit button of a POST form to this same-origin path (works without JavaScript). */
  readonly formAction?: string;
  /**
   * Shows the caption at a fixed spot low in the middle of the scene until the
   * world first places it, so primary controls never wait for the GPU.
   */
  readonly standby?: boolean;
}

export interface GardenWorldProps {
  /** Which scene to paint; fixed for the component's lifetime. Defaults to the garden. */
  readonly composition?: WorldComposition;
  /** Landing: the door glows and can be tapped. */
  readonly doorInvite?: boolean;
  /** Landing: play the walk-through through the door. */
  readonly entering?: boolean;
  readonly onPickDoor?: () => void;
  /** Landing: the walk-through finished. */
  readonly onEntered?: () => void;
  /** Called every frame with the camera (for overlays such as the entry fade). */
  readonly onView?: (view: WorldView) => void;
  /** Reports the world's lifecycle (loading, ready, unsupported, stopped). */
  readonly onStatusChange?: (status: WorldStatus) => void;
  /** Replaces the default notices shown without WebGPU or after a failure. */
  readonly notice?: (status: "unsupported" | "stopped") => ReactNode;
  /** Number of planting spots to show (rounded up to whole beds of twelve). */
  readonly spotCapacity?: number;
  /** One-based spots that already hold a flower; they get no empty marker. */
  readonly occupiedSpots?: readonly number[];
  /** Pickable flowers drawn by layers. */
  readonly flowers?: readonly FlowerAnchor[];
  /** Content drawn inside the world, such as the procedural flowers. */
  readonly layers?: readonly WorldLayer[];
  /** Handwritten captions floating in the scene. */
  readonly captions?: readonly WorldCaption[];
  /** Fixed sky time (for previews and tests); the live clock otherwise. */
  readonly time?: Date;
  readonly onPickSpot?: (spot: number) => void;
  readonly onPickFlower?: (id: string) => void;
  readonly className?: string;
  /** Accessible description of the scene. */
  readonly label?: string;
}

export type WorldStatus = "loading" | "ready" | "unsupported" | "stopped";
type Status = WorldStatus;

const EMPTY: readonly never[] = [];
/** Journey step for one key press. */
const KEY_STEP = 0.2;
/** Device losses the world recovers from by recreating its GPU context before giving up. */
export const DEVICE_LOSS_RECOVERIES = 1;

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** True when the browser exposes WebGPU at all (the adapter is checked on start). */
export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}

/**
 * The painted lakeside garden. Requires WebGPU; otherwise shows a notice
 * linking to the legacy garden. Scroll, swipe or arrow keys travel in toward
 * the beds; pointer movement adds parallax; clicking picks spots and flowers.
 */
export function GardenWorld({
  composition = "garden",
  doorInvite = false,
  entering = false,
  onPickDoor,
  onEntered,
  onView,
  onStatusChange,
  notice,
  spotCapacity = SPOTS_PER_BED,
  occupiedSpots = EMPTY,
  flowers = EMPTY,
  layers = EMPTY,
  captions = EMPTY,
  time,
  onPickSpot,
  onPickFlower,
  className,
  label = "A painted garden meadow beside a lake, with planting beds",
}: GardenWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const captionRefs = useRef(new Map<string, HTMLElement>());
  const captionsRef = useRef(captions);
  const [status, setStatus] = useState<Status>("loading");
  const reducedMotion = usePrefersReducedMotion();
  const timeValue = time?.getTime() ?? null;
  const statusRef = useRef(onStatusChange);
  useEffect(() => {
    statusRef.current = onStatusChange;
  });
  useEffect(() => {
    statusRef.current?.(status);
  }, [status]);

  const sceneState: WorldSceneState = {
    composition,
    doorInvite,
    entering,
    spotCapacity,
    occupiedSpots,
    flowers,
    layers,
    time: timeValue === null ? null : new Date(timeValue),
    reducedMotion,
  };
  const stateRef = useRef(sceneState);
  const motionRef = useRef(reducedMotion);
  const pickRef = useRef({ onPickSpot, onPickFlower, onPickDoor, onEntered, onView });

  useEffect(() => {
    pickRef.current = { onPickSpot, onPickFlower, onPickDoor, onEntered, onView };
    captionsRef.current = captions;
    motionRef.current = reducedMotion;
  });

  useEffect(() => {
    stateRef.current = sceneState;
    rendererRef.current?.update(sceneState);
    // sceneState is rebuilt from these inputs every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotCapacity, occupiedSpots, flowers, layers, timeValue, reducedMotion, doorInvite, entering]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasWebGpu()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability is only known in the browser
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    let renderer: WorldRenderer | null = null;
    let recoveries = 0;
    const placeCaptions = (view: WorldView) => {
      pickRef.current.onView?.(view);
      const t = motionRef.current ? 0 : performance.now() / 1000;
      captionsRef.current.forEach((caption, index) => {
        const element = captionRefs.current.get(caption.id);
        if (!element) return;
        const ndc = projectToNdc(view.viewProjection, caption.position);
        const visible = ndc !== null && Math.abs(ndc[0]) < 1.2 && Math.abs(ndc[1]) < 1.2 && ndc[2] < 1;
        element.style.visibility = visible ? "visible" : "hidden";
        if (!ndc || !visible) return;
        // A gentle float, like type drifting on warm air.
        const driftX = Math.sin(t * 0.5 + index * 1.7) * 3;
        const driftY = Math.sin(t * 0.7 + index * 2.3) * 4;
        const x = ((ndc[0] + 1) / 2) * view.width + driftX;
        const y = ((1 - ndc[1]) / 2) * view.height + driftY;
        element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      });
    };
    const launch = () => {
      void import("./renderer")
        .then(({ createWorldRenderer }) => {
          if (cancelled) return;
          renderer = createWorldRenderer(canvas, stateRef.current, {
            onReady: () => {
              if (!cancelled) setStatus("ready");
            },
            onUnsupported: (error) => {
              console.warn("Painted garden unavailable", error);
              if (!cancelled) setStatus("unsupported");
            },
            onError: (error) => {
              console.error("Painted garden stopped", error);
              if (!cancelled) setStatus("stopped");
            },
            onLost: (info) => {
              console.warn(`Painted garden lost its GPU device (${info.reason}): ${info.message}`);
              renderer = null;
              rendererRef.current = null;
              if (cancelled) return;
              if (recoveries < DEVICE_LOSS_RECOVERIES) {
                // Recreate the whole GPU context once; driver resets are often transient.
                recoveries += 1;
                setStatus("loading");
                launch();
              } else {
                setStatus("stopped");
              }
            },
            onPick: (result) => {
              if (result.kind === "spot") pickRef.current.onPickSpot?.(result.spot);
              else if (result.kind === "door") pickRef.current.onPickDoor?.();
              else pickRef.current.onPickFlower?.(result.id);
            },
            onFrame: placeCaptions,
            onEntered: () => {
              if (!cancelled) pickRef.current.onEntered?.();
            },
          });
          rendererRef.current = renderer;
        })
        .catch((error: unknown) => {
          console.warn("Painted garden failed to load", error);
          if (!cancelled) setStatus("unsupported");
        });
    };
    launch();
    return () => {
      cancelled = true;
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const step = event.key === "ArrowUp" || event.key === "PageDown" ? KEY_STEP : event.key === "ArrowDown" || event.key === "PageUp" ? -KEY_STEP : 0;
    if (step === 0) return;
    event.preventDefault();
    rendererRef.current?.travel(step);
  };

  const classes = [styles.world, handFont.className, className].filter(Boolean).join(" ");
  if (notice && (status === "unsupported" || status === "stopped")) {
    return (
      <div className={classes} data-status={status}>
        {notice(status)}
      </div>
    );
  }
  if (status === "unsupported") {
    return (
      <div className={classes} data-status={status}>
        <div className={styles.notice} role="status">
          <p className={styles.noticeTitle}>This garden is painted with WebGPU.</p>
          <p>Your browser can’t show it yet. Try a recent Chrome, Edge or Safari, or visit the earlier garden.</p>
          <Link className={styles.noticeLink} href="/legacy">
            Open the earlier garden
          </Link>
        </div>
      </div>
    );
  }
  if (status === "stopped") {
    return (
      <div className={classes} data-status={status}>
        <div className={styles.notice} role="alert">
          <p className={styles.noticeTitle}>The painted garden stopped.</p>
          <p>Something interrupted the graphics. Reloading usually brings it back.</p>
          <div className={styles.noticeActions}>
            <button type="button" className={styles.noticeLink} onClick={() => window.location.reload()}>
              Reload
            </button>
            <Link className={styles.noticeLink} href="/legacy">
              Open the earlier garden
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={classes}
      data-status={status}
      tabIndex={composition === "garden" ? 0 : undefined}
      onKeyDown={composition === "garden" ? onKeyDown : undefined}
      aria-label={composition === "garden" ? `${label}. Use the up and down arrow keys to walk closer or step back.` : undefined}
    >
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
      <div className={styles.captions}>
        {captions.map((caption) => {
          const className = [styles.caption, caption.size === "title" ? styles.title : styles.label, caption.standby ? styles.standby : ""]
            .filter(Boolean)
            .join(" ");
          const ref = (element: HTMLElement | null) => {
            if (element) captionRefs.current.set(caption.id, element);
            else captionRefs.current.delete(caption.id);
          };
          if (caption.formAction) {
            return (
              <form key={caption.id} ref={ref} className={className} action={caption.formAction} method="post">
                <button type="submit" className={styles.captionButton}>
                  {caption.text}
                </button>
              </form>
            );
          }
          return caption.onSelect ? (
            <button key={caption.id} ref={ref} type="button" className={className} onClick={caption.onSelect}>
              {caption.text}
            </button>
          ) : (
            <span key={caption.id} ref={ref} className={className}>
              {caption.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
