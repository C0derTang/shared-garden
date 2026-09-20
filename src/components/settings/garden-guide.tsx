"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { guideStep } from "@/lib/settings/model";
import type { GardenState } from "@/lib/garden/model";
import { useMemberPreferences } from "./member-preferences";
import styles from "./settings.module.css";

type FocusRequest = { target: "show" | "guide" | "garden"; origin: HTMLButtonElement };
export function GardenGuide({ state, paused, visit, focusGarden }: { state: GardenState; paused: boolean; visit: (spot: number) => void; focusGarden: () => void }) {
  const preferences = useMemberPreferences();
  const [closedRequest, setClosedRequest] = useState<number | null>(null);
  const closed = closedRequest !== null && closedRequest === preferences?.guideRequest;
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const handledFocus = useRef<FocusRequest | null>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!focusRequest || handledFocus.current === focusRequest) return;
    handledFocus.current = focusRequest;
    // Only a deliberate local action requests focus. A slow save must leave
    // another focused control (including an open flower draft) alone.
    if (document.activeElement !== focusRequest.origin && document.activeElement !== document.body) return;
    if (focusRequest.target === "show") showButton.current?.focus();
    else if (focusRequest.target === "guide") heading.current?.focus();
    else focusGarden();
  }, [focusRequest, focusGarden]);
  async function dismiss(guide: "skipped" | "finished", origin: HTMLButtonElement) {
    if (!preferences || preferences.busy) return;
    if (await preferences.save({ guide })) setFocusRequest({ target: "garden", origin });
  }
  if (!preferences || preferences.state?.guide !== "open") return null;
  if (closed) return <button ref={showButton} type="button" aria-label="Show garden guide" className="button button-secondary" onClick={(event) => { setClosedRequest(null); setFocusRequest({ target: "guide", origin: event.currentTarget }); }}>Guide</button>;
  const step = guideStep(state);
  const copy = {
    cactus: ["A little hello", "Visit your permanent Cactus for a one-tap check-in. It never loses growth, and you can check in once each garden day, even after it blooms.", "Visit Cactus"],
    plant: ["Make room for a Rose", "Your Cactus check-in is already part of the garden. Choose a Rose seed in an empty patch, then open your new Rose to share a note about today.", "Choose a Rose seed"],
    rose: ["A note for your Rose", "There is already a growing Rose here. Open it to share a note about today. Your partner’s notes are ready to read, even before you share yours.", "Visit Rose"],
    blooms: ["Your Roses are in bloom", "These Roses are permanent and need no more watering. Enjoy their memories. When you want to grow another, choose a seed in an empty patch.", "Visit a blooming Rose"],
    ready: ["You’re finding your rhythm", "You have checked in to Cactus and shared a Rose note. Those real moments stay with your garden. Keep exploring together, at your own pace.", ""],
    unavailable: ["Grow at your own pace", "Your garden has moved along. Explore its flowers and the seeds available in an empty patch. You can finish this guide and return whenever you like.", ""],
  }[step.kind];
  return <section className={styles.guide} aria-label="Garden guide">
    <p className="eyebrow">A SMALL START, TOGETHER</p>
    <h2 ref={heading} tabIndex={-1}>{copy[0]}</h2><p aria-live="polite">{copy[1]}</p>
    <p className={styles.quiet}>Rose, Cactus, Tulip, and Marigold are available from the start. This guide never locks your seeds.</p>
    <div className={styles.actions}>
      {"spot" in step && <button className="button button-primary" type="button" aria-disabled={paused} onClick={() => { if (!paused) visit(step.spot); }}>{copy[2]}</button>}
      {["ready", "blooms", "unavailable"].includes(step.kind) && <button className="button button-primary" type="button" aria-disabled={preferences.busy} onClick={(event) => void dismiss("finished", event.currentTarget)}>Finish guide</button>}
      <button type="button" className="button button-secondary" aria-disabled={preferences.busy} onClick={(event) => void dismiss("skipped", event.currentTarget)}>Skip guide</button>
      <button type="button" className={styles.close} onClick={(event) => { setClosedRequest(preferences.guideRequest); setFocusRequest({ target: "show", origin: event.currentTarget }); }}>Close guide for now</button>
    </div>
    {paused && <p role="status">Waiting for a current garden update. Refresh the garden before choosing your next step.</p>}
    <small>You can reopen this guide in Settings. Only care you choose to share counts.</small>
    {preferences.error && <div role="alert"><p>{preferences.error}</p><button type="button" onClick={() => void preferences.refresh()}>Refresh settings</button></div>}
  </section>;
}
