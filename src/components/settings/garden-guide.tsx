"use client";
import { useState } from "react";
import { guideStep } from "@/lib/settings/model";
import type { GardenState } from "@/lib/garden/model";
import { useMemberPreferences } from "./member-preferences";
import styles from "./settings.module.css";

export function GardenGuide({ state, paused, visit }: { state: GardenState; paused: boolean; visit: (spot: number) => void }) {
  const preferences = useMemberPreferences();
  const [closed, setClosed] = useState(false);
  if (!preferences || preferences.state?.guide !== "open") return null;
  if (closed) return <button type="button" className="button button-secondary" onClick={() => setClosed(false)}>Show garden guide</button>;
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
    <h2>{copy[0]}</h2><p aria-live="polite">{copy[1]}</p>
    <p className={styles.quiet}>Rose, Cactus, Tulip, and Marigold are available from the start. This guide never locks your seeds.</p>
    <div className={styles.actions}>
      {"spot" in step && <button className="button button-primary" type="button" disabled={paused} onClick={() => visit(step.spot)}>{copy[2]}</button>}
      {["ready", "blooms", "unavailable"].includes(step.kind) && <button className="button button-primary" type="button" disabled={preferences.busy} onClick={() => void preferences.save({ guide: "finished" })}>Finish guide</button>}
      <button type="button" className="button button-secondary" disabled={preferences.busy} onClick={() => void preferences.save({ guide: "skipped" })}>Skip guide</button>
      <button type="button" className={styles.close} onClick={() => setClosed(true)}>Close guide for now</button>
    </div>
    {paused && <p role="status">Waiting for a current garden update. Refresh the garden before choosing your next step.</p>}
    <small>You can reopen this guide in Settings. Only care you choose to share counts.</small>
    {preferences.error && <div role="alert"><p>{preferences.error}</p><button type="button" onClick={() => void preferences.refresh()}>Refresh settings</button></div>}
  </section>;
}
