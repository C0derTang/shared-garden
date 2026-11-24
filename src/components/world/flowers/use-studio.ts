"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { hasWebGpu } from "../garden-world";
import type { StudioRenderer, StudioState, StudioView } from "./studio-renderer";

export type StudioStatus = "loading" | "ready" | "unsupported" | "stopped";

/** Device losses the studio recovers from by recreating its GPU context. */
const LOSS_RECOVERIES = 1;

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

/** Runs a flower studio renderer on `canvasRef` for as long as the component is mounted. */
export function useStudio(canvasRef: RefObject<HTMLCanvasElement | null>, state: StudioState, onFrame?: (view: StudioView) => void): StudioStatus {
  const [status, setStatus] = useState<StudioStatus>("loading");
  const stateRef = useRef(state);
  const frameRef = useRef(onFrame);
  const rendererRef = useRef<StudioRenderer | null>(null);

  useEffect(() => {
    stateRef.current = state;
    frameRef.current = onFrame;
    rendererRef.current?.update(state);
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasWebGpu()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- capability is only known in the browser
      setStatus("unsupported");
      return;
    }
    let cancelled = false;
    let recoveries = 0;
    const launch = () => {
      void import("./studio-renderer")
        .then(({ createStudioRenderer }) => {
          if (cancelled) return;
          rendererRef.current = createStudioRenderer(canvas, stateRef.current, {
            onReady: () => {
              if (!cancelled) setStatus("ready");
            },
            onUnsupported: (error) => {
              console.warn("Flower studio unavailable", error);
              if (!cancelled) setStatus("unsupported");
            },
            onError: (error) => {
              console.error("Flower studio stopped", error);
              if (!cancelled) setStatus("stopped");
            },
            onLost: (info) => {
              console.warn(`Flower studio lost its GPU device (${info.reason}): ${info.message}`);
              rendererRef.current = null;
              if (cancelled) return;
              if (recoveries < LOSS_RECOVERIES) {
                recoveries += 1;
                setStatus("loading");
                launch();
              } else {
                setStatus("stopped");
              }
            },
            onFrame: (view) => frameRef.current?.(view),
          });
        })
        .catch((error: unknown) => {
          console.warn("Flower studio failed to load", error);
          if (!cancelled) setStatus("unsupported");
        });
    };
    launch();
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [canvasRef]);

  return status;
}
