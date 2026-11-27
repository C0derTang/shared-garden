"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { gardenHouseOccludes } from "@/lib/world/garden-house-frame";
import { projectToNdc } from "@/lib/world/camera";
import { SPOTS_PER_BED, type Bed, type PlantingSpot, type Vec3 } from "@/lib/world/layout";
import { scenicMarkerPosition, type ScenicRoute } from "@/lib/world/scenic-route";
import type { FocusTarget } from "@/lib/world/journey";
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
  /**
   * "title" is large display type; "label" is small. "mark" is a small
   * decorative sign (the "♡" over a flower waiting on your care, #214): hidden
   * from assistive technology, never a control, its glow following the
   * plot-glow display level of the sky.
   */
  readonly size?: "title" | "label" | "mark";
  readonly maxDistance?: number;
  /** Makes the caption a button (or, with `href`, enhances the link). */
  readonly onSelect?: () => void;
  /**
   * Makes the caption a real link to this same-origin path, so it works
   * before scripts run. With `onSelect`, a plain click runs `onSelect` instead.
   */
  readonly href?: string;
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
  /** New garden: authoritative type-area geometry and pick positions. */
  readonly plantingLayout?: { readonly beds: readonly Bed[]; readonly spots: readonly PlantingSpot[]; readonly maxZ: number };
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
  /** Garden: the camera glides to this flower, and back when it becomes null. */
  readonly focus?: FocusTarget | null;
  /** Stop painting once the camera settles (a full-screen view covers the world). */
  readonly paused?: boolean;
  /** Opt into local free walking; landing and renderer showcases keep their journey. */
  readonly walking?: boolean;
  readonly walkingBlocked?: boolean;
  readonly scenicRoute?: ScenicRoute;
  readonly scenicStop?: string;
  readonly scenicBlocked?: boolean;
  readonly onSelectScenicStop?: (id: string) => void;
  /**
   * Garden: the arrival from the landing's walk-through (#204). Its value on
   * the first render decides whether there is one; "play" starts the move.
   */
  readonly arrival?: "hold" | "play" | null;
}

export type WorldStatus = "loading" | "ready" | "unsupported" | "stopped";
type Status = WorldStatus;

const EMPTY: readonly never[] = [];
/** Journey step for one key press. */
const KEY_STEP = 0.2;
/** Sideways step (world units) for one left or right arrow press. */
const PAN_STEP = 1.6;
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
  plantingLayout,
  occupiedSpots = EMPTY,
  flowers = EMPTY,
  layers = EMPTY,
  captions = EMPTY,
  time,
  onPickSpot,
  onPickFlower,
  className,
  label = "A painted garden meadow beside a lake, with planting beds",
  focus = null,
  paused = false,
  walking = false,
  walkingBlocked = false,
  scenicRoute,
  scenicStop,
  scenicBlocked = false,
  onSelectScenicStop,
  arrival = null,
}: GardenWorldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WorldRenderer | null>(null);
  const captionRefs = useRef(new Map<string, HTMLElement>());
  const captionLayerRef = useRef<HTMLDivElement>(null);
  const [scenicCameraReady, setScenicCameraReady] = useState(true);
  const scenicReadyRef = useRef(true);
  const scenicEnabled = Boolean(scenicRoute);
  const scenicStops = scenicRoute?.stops.filter(stop => !stop.transit) ?? [];
  const scenicIndex = Math.max(0, scenicStops.findIndex(stop => stop.id === scenicStop));
  const scenicPrevious = scenicStops[(scenicIndex + scenicStops.length - 1) % scenicStops.length];
  const scenicNext = scenicStops[(scenicIndex + 1) % scenicStops.length];
  const canSelect = scenicCameraReady && !scenicBlocked && !paused && !focus;
  const routePointer = useRef({ x: 0, y: 0, dragged: false });
  const selectedStop = scenicStops[scenicIndex];
  const nearbyStops = selectedStop ? scenicStops.filter(stop => stop.id !== selectedStop.id)
    .map(stop => ({stop, distance: Math.hypot(stop.pose.eye[0]-selectedStop.pose.eye[0],stop.pose.eye[2]-selectedStop.pose.eye[2])}))
    .filter(candidate => candidate.distance < 30).sort((a,b) => a.distance-b.distance).slice(0,6).map(candidate => candidate.stop) : [];
  const markerStops = [...new Map([scenicPrevious,scenicNext,...nearbyStops].filter(stop => Boolean(stop)).map(stop => [stop!.id,stop!])).values()];
  const routeCaptions: readonly WorldCaption[] = scenicRoute && canSelect ? markerStops.map(stop => ({
    id: `route-${stop.id}`, text: `◇ ${stop.label}`, position: scenicMarkerPosition(stop),
    onSelect: () => onSelectScenicStop?.(stop.id), size: "label",
  })) : [];

  const allCaptions = [...captions, ...routeCaptions];
  const captionsRef = useRef(allCaptions);
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
    plantingLayout,
    occupiedSpots,
    flowers,
    layers,
    time: timeValue === null ? null : new Date(timeValue),
    reducedMotion,
    focus,
    paused,
    walking,
    walkingBlocked,
    scenicRoute,
    scenicStop,
    scenicBlocked,
    arrival,
  };
  const stateRef = useRef(sceneState);
  const motionRef = useRef(reducedMotion);
  const pickRef = useRef({ onPickSpot, onPickFlower, onPickDoor, onEntered, onView });

  useEffect(() => {
    pickRef.current = { onPickSpot, onPickFlower, onPickDoor, onEntered, onView };
    captionsRef.current = allCaptions;
    motionRef.current = reducedMotion;
  });

  useEffect(() => {
    stateRef.current = sceneState;
    rendererRef.current?.update(sceneState);
    // sceneState is rebuilt from these inputs every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotCapacity, plantingLayout, occupiedSpots, flowers, layers, timeValue, reducedMotion, doorInvite, entering, focus, paused, walking, walkingBlocked, scenicRoute, scenicStop, scenicBlocked, arrival]);

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
    let glowLevel = "";
    const placeCaptions = (view: WorldView) => {
      pickRef.current.onView?.(view);
      if(view.scenicReady !== undefined && view.scenicReady !== scenicReadyRef.current){scenicReadyRef.current=view.scenicReady;setScenicCameraReady(view.scenicReady);}
      // Floating marks glow like the plots: the same display level by day, quieter at night.
      const glow = (view.glow ?? 1).toFixed(2);
      if (glow !== glowLevel) {
        glowLevel = glow;
        captionLayerRef.current?.style.setProperty("--plot-glow", glow);
      }
      const t = motionRef.current ? 0 : performance.now() / 1000;
      const canvasBounds = canvas.getBoundingClientRect();
      const reservedControls = stateRef.current.scenicRoute ? [...document.querySelectorAll("nav, [data-world-reserved]")].map(element => element.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({left:rect.left-canvasBounds.left,right:rect.right-canvasBounds.left,top:rect.top-canvasBounds.top,bottom:rect.bottom-canvasBounds.top})) : [];
      const placedLabels: { x: number; y: number; w: number; h: number }[] = [];
      const distance = (caption: WorldCaption) => view.eye ? Math.hypot(caption.position[0]-view.eye[0],caption.position[2]-view.eye[2]) : 0;
      (stateRef.current.scenicRoute ? [...captionsRef.current].sort((a,b)=>distance(a)-distance(b)) : captionsRef.current).forEach((caption, index) => {
        const element = captionRefs.current.get(caption.id);
        if (!element) return;
        const ndc = projectToNdc(view.viewProjection, caption.position);
        let visible = (caption.maxDistance === undefined || distance(caption) <= caption.maxDistance) && !(stateRef.current.scenicRoute && view.eye && gardenHouseOccludes(view.eye, caption.position)) && ndc !== null && Math.abs(ndc[0]) < 1.2 && Math.abs(ndc[1]) < 1.2 && ndc[2] < 1;
        if(stateRef.current.scenicRoute && visible && ndc && caption.size === "label"){
          const box={x:(ndc[0]+1)/2*view.width-element.offsetWidth/2,y:(1-ndc[1])/2*view.height-element.offsetHeight/2,w:element.offsetWidth,h:element.offsetHeight};
          if(placedLabels.some(other=>box.x<other.x+other.w+12&&box.x+box.w+12>other.x&&box.y<other.y+other.h+8&&box.y+box.h+8>other.y))visible=false;
          else placedLabels.push(box);
        }
        const control = Boolean(caption.onSelect || caption.href || caption.formAction);
        if(stateRef.current.scenicRoute && control && ndc){
          const x=(ndc[0]+1)/2*view.width,y=(1-ndc[1])/2*view.height,halfW=element.offsetWidth/2+12,halfH=element.offsetHeight/2+12;
          if(x<halfW||x>view.width-halfW||y<halfH||y>view.height-halfH||reservedControls.some(rect=>x+halfW>rect.left&&x-halfW<rect.right&&y+halfH>rect.top&&y-halfH<rect.bottom))visible=false;
        }
        if (!visible && control) {
          // Out of view, a control stays reachable by keyboard: invisible, pinned
          // inside the edge, and shown there while focused.
          element.style.visibility = "visible";
          element.dataset.offscreen = "";
          element.style.opacity = "0";
          const [cx, cy] = ndc && ndc[2] < 1 ? [ndc[0], ndc[1]] : [0, -0.8];
          // Clamp by the caption's own size so its focus ring stays on screen.
          const margin = 12;
          const halfW = element.offsetWidth / 2 + margin;
          const halfH = element.offsetHeight / 2 + margin;
          const x = Math.min(Math.max(((cx + 1) / 2) * view.width, halfW), Math.max(halfW, view.width - halfW));
          let y = Math.min(Math.max(((1 - cy) / 2) * view.height, halfH), Math.max(halfH, view.height - halfH));
          for(const rect of reservedControls){
            if(x+halfW>rect.left&&x-halfW<rect.right&&y+halfH>rect.top&&y-halfH<rect.bottom){
              const below=rect.bottom+halfH;y=below<view.height-halfH?below:Math.max(halfH,rect.top-halfH);
            }
          }
          element.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
          return;
        }
        if (element.dataset.offscreen !== undefined) {
          delete element.dataset.offscreen;
          element.style.opacity = "";
        }
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
              // After a device loss this browser did have WebGPU: failing to get
              // it back means the painting stopped, not that it is unsupported.
              if (!cancelled) setStatus(recoveries > 0 ? "stopped" : "unsupported");
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
          if (!cancelled) setStatus(recoveries > 0 ? "stopped" : "unsupported");
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
    if (walking || scenicEnabled || event.target !== event.currentTarget) return;
    const step = event.key === "ArrowUp" || event.key === "PageDown" ? KEY_STEP : event.key === "ArrowDown" || event.key === "PageUp" ? -KEY_STEP : 0;
    const side = event.key === "ArrowRight" ? PAN_STEP : event.key === "ArrowLeft" ? -PAN_STEP : 0;
    if (step === 0 && side === 0) return;
    event.preventDefault();
    if (step) rendererRef.current?.travel(step);
    if (side) rendererRef.current?.pan(side);
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
      data-garden-world=""
      tabIndex={composition === "garden" ? 0 : undefined}
      onKeyDown={composition === "garden" ? onKeyDown : undefined}
      aria-label={
        composition === "garden" ? scenicEnabled ? `${label}. Choose scenic stops along the garden path; tap a flower to visit.` : walking ? `${label}. Hold WASD or arrow keys to walk. Click ground to walk there; tap a flower to visit.` : `${label}. Use the up and down arrow keys to walk closer or step back, and left and right to walk along the beds.` : undefined
      }
    >
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
      {walking && status === "ready" && !walkingBlocked && !paused && !focus && (
        <div className={styles.walkControls} role="group" aria-label="Walk around the garden">
          <span>walk</span>
          <div>
            <button type="button" data-walk="forward" aria-label="Walk forward">↑</button>
            <button type="button" data-walk="left" aria-label="Walk left">←</button>
            <button type="button" data-walk="back" aria-label="Walk backward">↓</button>
            <button type="button" data-walk="right" aria-label="Walk right">→</button>
          </div>
        </div>
      )}
      {scenicEnabled && status === "ready" && canSelect && (
        <nav className={styles.scenicControls} aria-label="Garden path"
          onPointerDownCapture={event => {
            routePointer.current = { x: event.clientX, y: event.clientY, dragged: false };
            const button = (event.target as HTMLElement).closest("button");
            if(button && event.isPrimary && event.button===0)button.setPointerCapture?.(event.pointerId);
          }}
          onPointerCancelCapture={() => { routePointer.current.dragged = true; }}
          onPointerMoveCapture={event => { if (Math.hypot(event.clientX-routePointer.current.x,event.clientY-routePointer.current.y)>8) routePointer.current.dragged=true; }}
          onClickCapture={event => { if (routePointer.current.dragged && event.detail > 0) { event.preventDefault(); event.stopPropagation(); } }}>
          <div>
            <button type="button" aria-label={`Back to ${scenicPrevious?.label}`} onClick={() => scenicPrevious && onSelectScenicStop?.(scenicPrevious.id)}>← back</button>
            <label><span className={styles.srOnly}>Scenic stop</span><select aria-label="Scenic stop" value={scenicStop ?? scenicStops[0]?.id} onChange={event => onSelectScenicStop?.(event.target.value)}>
              {scenicStops.map(stop => <option key={stop.id} value={stop.id}>{stop.label}</option>)}
            </select></label>
            <button type="button" aria-label={`Onward to ${scenicNext?.label}`} onClick={() => scenicNext && onSelectScenicStop?.(scenicNext.id)}>onward →</button>
          </div>
        </nav>
      )}
      <div ref={captionLayerRef} className={styles.captions}>
        {allCaptions.map((caption) => {
          const className = [
            styles.caption,
            caption.size === "title" ? styles.title : caption.size === "mark" ? styles.mark : styles.label,
            caption.standby ? styles.standby : "",
          ]
            .filter(Boolean)
            .join(" ");
          const ref = (element: HTMLElement | null) => {
            if (element) captionRefs.current.set(caption.id, element);
            else captionRefs.current.delete(caption.id);
          };
          if (caption.formAction) {
            return (
              <form key={caption.id} ref={ref} className={className} action={caption.formAction} method="post" data-caption={caption.id}>
                <button type="submit" className={styles.captionButton}>
                  {caption.text}
                </button>
              </form>
            );
          }
          if (caption.href) {
            const select = caption.onSelect;
            return (
              <a
                key={caption.id}
                ref={ref}
                className={className}
                data-caption={caption.id}
                href={caption.href}
                onClick={
                  select
                    ? (event) => {
                        // Let modified clicks open the link normally.
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        select();
                      }
                    : undefined
                }
              >
                {caption.text}
              </a>
            );
          }
          return caption.onSelect ? (
            <button key={caption.id} ref={ref} type="button" className={className} disabled={scenicEnabled && !canSelect} onPointerDown={event => {
                routePointer.current={x:event.clientX,y:event.clientY,dragged:false};
                if(event.isPrimary && event.button===0)event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerCancel={() => { routePointer.current.dragged=true; }}
              onPointerMove={event => { if(Math.hypot(event.clientX-routePointer.current.x,event.clientY-routePointer.current.y)>8)routePointer.current.dragged=true; }}
              onClick={event => { if(event.detail===0 || !routePointer.current.dragged)caption.onSelect?.(); }} data-caption={caption.id}>
              {caption.text}
            </button>
          ) : (
            <span key={caption.id} ref={ref} className={className} data-caption={caption.id} aria-hidden={caption.size === "mark" || undefined}>
              {caption.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
