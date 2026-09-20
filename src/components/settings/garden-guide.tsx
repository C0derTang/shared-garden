"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, useState } from "react";
import { guideStep } from "@/lib/settings/model";
import type { GardenState } from "@/lib/garden/model";
import { useSheetScope } from "@/components/ui/sheet-scope";
import { useMemberPreferences } from "./member-preferences";
import styles from "./guide.module.css";

export function GardenGuide({ state, paused, visit, focusGarden, actionOpen = false, enabled = true }: {
  state: GardenState; paused: boolean; visit: (spot: number) => void;
  focusGarden: () => void; actionOpen?: boolean; enabled?: boolean;
}) {
  const preferences = useMemberPreferences();
  const scope = useSheetScope();
  const id = useId();
  const [closedRequest, setClosedRequest] = useState<number | null>(null);
  const closed = closedRequest !== null && closedRequest === preferences?.guideRequest;
  const [focusTarget, setFocusTarget] = useState<"show" | "garden" | null>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const requested = enabled && preferences?.state?.guide === "open" && !closed && !actionOpen;
  const request = scope?.request, release = scope?.release;
  useEffect(() => {
    if (requested) request?.(id);
    return () => release?.(id);
  }, [id, requested, request, release]);
  const visible = requested && (!scope || scope.active === id);
  useEffect(() => {
    if (!focusTarget || scope?.active || !enabled || actionOpen) return;
    // Closing a local prompt may restore focus only once the queue is empty.
    // A slow save or a pending private moment must never interrupt another draft.
    if (document.activeElement !== document.body && document.activeElement !== showButton.current) return;
    if (focusTarget === "show" && showButton.current) showButton.current.focus({ preventScroll: true });
    else focusGarden();
  }, [focusTarget, scope?.active, enabled, actionOpen, focusGarden]);
  function close() {
    setClosedRequest(preferences!.guideRequest);
    setFocusTarget("show");
  }
  async function dismiss(guide: "skipped" | "finished") {
    if (!preferences || preferences.busy) return;
    if (await preferences.save({ guide })) setFocusTarget("garden");
  }
  if (!preferences || preferences.state?.guide !== "open") return null;
  if (closed) return <button ref={showButton} type="button" aria-label="Show garden guide" className="button button-secondary" onClick={() => { setClosedRequest(null); setFocusTarget(null); }}>Guide</button>;
  const step = guideStep(state);
  const copy = {
    cactus: ["A little hello", "Check in to your permanent Cactus with one tap.", "Visit Cactus"],
    plant: ["Make room for a Rose", "Choose a Rose for your first note, or explore any available seed.", "Choose a Rose seed"],
    rose: ["A note for your Rose", "Share a note about today with the Rose already growing here.", "Visit Rose"],
    blooms: ["Your Roses are in bloom", "Enjoy a blooming Rose’s memories whenever you like.", "Visit a blooming Rose"],
    ready: ["You’re finding your rhythm", "Your Cactus check-in and Rose note are part of the garden.", ""],
    unavailable: ["Grow at your own pace", "Explore the flowers and seeds in your garden whenever you like.", ""],
  }[step.kind];
  const completed = Number(state.tutorial_facts.cactus_checked_in) + Number(state.tutorial_facts.rose_noted);
  return <Dialog.Root open={visible} onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.guide} onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        <p className={styles.progress}>Garden guide · {completed}/2 moments shared</p>
        <Dialog.Title ref={heading} tabIndex={-1}>{copy[0]}</Dialog.Title>
        <Dialog.Description aria-live="polite">{copy[1]}</Dialog.Description>
        {"spot" in step ? <button className="button button-primary" type="button" aria-disabled={paused} onClick={() => { if (!paused) { setFocusTarget(null); visit(step.spot); } }}>{copy[2]}</button>
          : <button className="button button-primary" type="button" aria-disabled={preferences.busy} onClick={() => void dismiss("finished")}>Finish guide</button>}
        <div className={styles.actions}>
          {step.kind === "blooms" && <button type="button" className={styles.secondary} aria-disabled={preferences.busy} onClick={() => void dismiss("finished")}>Finish guide</button>}
          <button type="button" className={styles.secondary} aria-disabled={preferences.busy} onClick={() => void dismiss("skipped")}>Skip guide</button>
          <button type="button" className={styles.secondary} onClick={close}>Close guide for now</button>
        </div>
        {paused && <p role="status">Garden updates are paused. Close this guide to refresh.</p>}
        <small>Reopen anytime in Settings.</small>
        {preferences.error && <div role="alert"><p>{preferences.error}</p><button type="button" className="button button-secondary" aria-disabled={preferences.busy} onClick={() => { if (!preferences.busy) void preferences.refresh(); }}>Refresh settings</button></div>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
