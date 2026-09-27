"use client";
import Link from "next/link";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";
import type { GardenState } from "@/lib/garden/model";
import {
  clearSpotRequest,
  parseSpotRequest,
  requestSpot,
  resolveSpotRequest,
  serverSpotRequestSnapshot,
  settleSpotRequest,
  spotRequestSnapshot,
  subscribeSpotRequest,
  cactusHref,
  spotHref,
  type SpotRequest,
} from "@/lib/garden/spot-request";
import styles from "./spot-request.module.css";

// Drop the one-shot query so closing the sheet or reloading stays on /garden.
function forgetQuery() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("spot") && !url.searchParams.has("flower")) return;
  url.searchParams.delete("spot");
  url.searchParams.delete("flower");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Opens a requested flower (decision 0055) once the garden has state and no
 * route panel covers it. Unknown or empty spots explain themselves instead.
 */
export function useSpotRequest(
  state: GardenState | null,
  enabled: boolean,
  open: (spot: number) => void,
) {
  const { request, notice } = useSyncExternalStore(subscribeSpotRequest, spotRequestSnapshot, serverSpotRequestSnapshot);
  // The garden persists across panels, so a direct URL is read once on mount.
  useEffect(() => {
    const fromUrl = parseSpotRequest(window.location.search);
    if (fromUrl) requestSpot(fromUrl);
  }, []);
  useEffect(() => {
    if (!request || !state || !enabled) return;
    forgetQuery();
    const result = resolveSpotRequest(request, state);
    settleSpotRequest("notice" in result ? result.notice : "");
    if ("spot" in result) open(result.spot);
  }, [request, state, enabled, open]);
  return { notice, dismiss: clearSpotRequest };
}

export function SpotNotice({ notice, dismiss }: { notice: string; dismiss: () => void }) {
  return (
    <div className={styles.host} role="status" data-spot-notice="">
      {notice && (
        <p className={styles.notice}>
          <span>{notice}</span>
          <button type="button" className="pixel-button" onClick={dismiss}>
            OK
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * A link back into the garden that opens one flower. The URL alone works when
 * loaded directly; an ordinary click also records the request so the garden
 * opens it as soon as the route panel closes.
 */
export function GardenSpotLink({
  request,
  onClick,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { request: SpotRequest }) {
  return (
    <Link
      {...props}
      href={"spot" in request ? spotHref(request.spot) : cactusHref}
      prefetch={false}
      scroll={false}
      onClick={(event) => {
        onClick?.(event);
        const plain = event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        if (plain && !event.defaultPrevented) requestSpot(request);
      }}
    />
  );
}
