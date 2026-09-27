"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { guideStep } from "@/lib/settings/model";
import type { GardenState } from "@/lib/garden/model";
import { useSheetScope } from "@/components/ui/sheet-scope";
import { useMemberPreferences } from "./member-preferences";
import { bubbleGutter, chooseScroll, placeBubble, type Placement, type Rect } from "./guide-placement";
import styles from "./guide.module.css";

type Layout = { key: string; target: Rect | null; placement: Placement };

/** The bands the guide uses: the bubble stays below the garden header (which
    scrolls with the garden) and above the hotbar; the lit flower also stays
    above the Today card, which the bubble may cover while it is dimmed. */
function safeBand() {
  const header = document.querySelector("#main-content header")?.getBoundingClientRect();
  const top = (element: Element | null | undefined) => {
    const rect = element?.getBoundingClientRect();
    return rect && rect.height > 0 ? rect.top : window.innerHeight;
  };
  const hotbar = top(document.querySelector(".garden-navigation"));
  const today = top(document.querySelector('[data-today-focus="title"]')?.closest("section"));
  const headerBottom = header && header.height > 0 ? header.bottom : 0;
  return {
    headerBottom,
    safeTop: Math.max(0, headerBottom) + bubbleGutter,
    safeBottom: hotbar - bubbleGutter,
    flowerBottom: Math.min(hotbar, today) - bubbleGutter,
  };
}

export function GardenGuide({ state, paused, visit, focusGarden, actionOpen = false, enabled = true, onRequestedChange }: {
  state: GardenState; paused: boolean; visit: (spot: number) => void;
  focusGarden: () => void; actionOpen?: boolean; enabled?: boolean;
  /** Whether the guide wants to be on screen, so the away card can wait. */
  onRequestedChange?: (requested: boolean) => void;
}) {
  const preferences = useMemberPreferences();
  const scope = useSheetScope();
  const id = useId();
  const [closedRequest, setClosedRequest] = useState<number | null>(null);
  const closed = closedRequest !== null && closedRequest === preferences?.guideRequest;
  const [focusTarget, setFocusTarget] = useState<"show" | "garden" | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const requested = enabled && preferences?.state?.guide === "open" && !closed && !actionOpen;
  const request = scope?.request, release = scope?.release;
  useEffect(() => {
    if (requested) request?.(id);
    return () => release?.(id);
  }, [id, requested, request, release]);
  // Keeps the parent's copy current after its first render, which computes
  // the same condition itself so the away card is held from the start.
  useEffect(() => { onRequestedChange?.(requested); }, [requested, onRequestedChange]);
  const visible = requested && (!scope || scope.active === id);
  const step = guideStep(state);
  const spot = "spot" in step ? step.spot : null;
  const layoutKey = `${step.kind}:${spot ?? ""}`;
  // Follow the real flower on screen and fit the whole bubble between the
  // garden header and the hotbar or Today card. Nothing is placed until the
  // fonts have loaded, since text sizes decide the fit. The first placement
  // may scroll the garden (chooseScroll), and so may any later one that would
  // dock over a measurable flower; layout, content and resize changes
  // re-measure.
  useEffect(() => {
    if (!visible) return;
    const target = () => spot === null ? null : document.querySelector<HTMLElement>(`[data-spot="${spot}"]`);
    let ready = false, live = true, decided = false, scrolls = 0, frame = 0;
    const measure = () => {
      if (!ready) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target()?.getBoundingClientRect();
        const box = rect && rect.width > 0 && rect.height > 0 ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : null;
        const frameHeight = (bubble.current?.offsetHeight ?? 0) - (body.current?.clientHeight ?? 0);
        const bubbleHeight = frameHeight + (body.current?.scrollHeight ?? 0);
        const input = { target: box, bubbleHeight, viewWidth: window.innerWidth, viewHeight: window.innerHeight, ...safeBand() };
        const placement = placeBubble(input);
        // A few scrolls at most per opening, so a layout that never fits cannot loop.
        if (box && (!decided || placement.side === "dock") && scrolls < 3) {
          decided = true;
          const page = document.scrollingElement ?? document.documentElement;
          const choice = chooseScroll({ ...input, minDelta: -page.scrollTop, maxDelta: Math.max(0, page.scrollHeight - window.innerHeight - page.scrollTop) });
          if (Math.abs(choice.delta) >= 1) {
            scrolls++;
            // The scroll listener measures again at the new position.
            window.scrollBy({ top: choice.delta, behavior: "instant" });
            return;
          }
        }
        setLayout({ key: layoutKey, target: box, placement });
      });
    };
    // Fonts decide text sizes, so the first placement waits for them.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!live) return;
      ready = true;
      measure();
    });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const floating = [document.querySelector(".garden-navigation"), document.querySelector('[data-today-focus="title"]')?.closest("section")];
    for (const element of [target(), content.current, document.documentElement, ...floating]) if (element) observer?.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      live = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      // A reopened guide measures afresh instead of showing a stale frame.
      setLayout(null);
    };
  }, [visible, spot, layoutKey]);
  const registerNoticeContainer = scope?.registerNoticeContainer;
  const noticeContainerRef = useCallback((element: HTMLDivElement | null) => {
    registerNoticeContainer?.(id, element);
  }, [id, registerNoticeContainer]);
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
  const copy = {
    cactus: ["Tap your Cactus to say hello", "One tap checks you in for today.", "Visit Cactus"],
    plant: ["Tap bare soil to plant a Rose", "Pick a Rose for your first note, or any seed you like.", "Choose a Rose seed"],
    rose: ["Tap your Rose to leave a note", "Share a short note about today.", "Visit Rose"],
    blooms: ["Your Rose is in bloom", "Tap it to enjoy its memories whenever you like.", "Visit a blooming Rose"],
    ready: ["You’re both set", "Your Cactus hello and Rose note are part of the garden now.", ""],
    unavailable: ["Grow at your own pace", "Explore the flowers and seeds in your garden whenever you like.", ""],
  }[step.kind];
  const completed = Number(state.tutorial_facts.cactus_checked_in) + Number(state.tutorial_facts.rose_noted);
  const current = layout?.key === layoutKey ? layout : null;
  const target = current?.target ?? null;
  const place = current?.placement;
  const primary = () => { if (spot !== null && !paused) { setFocusTarget(null); visit(spot); } };
  const pad = 6;
  return <Dialog.Root open={visible} onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} data-spotlight={target ? "" : undefined} />
      <Dialog.Content className={styles.coach} data-guide="" onOpenAutoFocus={(event) => { event.preventDefault(); heading.current?.focus(); }} onCloseAutoFocus={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
        {target && <>
          <div className={styles.spotlight} aria-hidden="true" style={{ left: target.left - pad, top: target.top - pad, width: target.width + pad * 2, height: target.height + pad * 2 }} />
          {/* Tapping the highlighted flower itself is the pointer shortcut for
              the primary action; keyboard and screen-reader users use the button. */}
          <div className={styles.hotspot} data-guide-target={spot} aria-hidden="true" data-paused={paused || undefined} onClick={primary} style={{ left: target.left, top: target.top, width: target.width, height: target.height }} />
        </>}
        {place?.arrow && <span className={styles.arrow} data-side={place.side} aria-hidden="true" style={place.arrow} />}
        {/* Until the first measurement the bubble is laid out invisibly, so it
            never flashes in the wrong place; it stays focusable meanwhile. */}
        <div ref={bubble} className={styles.bubble} data-guide-bubble="" data-side={place?.side ?? "dock"} data-pending={place ? undefined : ""} style={place?.bubble}>
          <div ref={body} className={styles.body} style={place ? { maxHeight: `max(0px, ${place.bubble.maxHeight}px - 24px)` } : undefined}><div ref={content}>
          <p className={styles.progress}>
            <span>Garden guide</span>
            <span className={styles.pips}>
              {[0, 1].map((index) => <i key={index} data-done={index < completed || undefined} aria-hidden="true" />)}
              <span aria-hidden="true">{completed}/2</span>
              <span className={styles.visuallyHidden}>{completed} of 2 moments shared</span>
            </span>
          </p>
          <Dialog.Title ref={heading} tabIndex={-1} className={styles.title}>{copy[0]}{step.kind === "ready" && <span aria-hidden="true"> ✿</span>}</Dialog.Title>
          <Dialog.Description aria-live="polite" className={styles.description}>{copy[1]}</Dialog.Description>
          <div ref={noticeContainerRef} className={styles.notices} data-private-notice-host="guide" />
          <div className={styles.controls}>
            {spot !== null ? <button className="button button-primary" type="button" aria-disabled={paused} onClick={primary}>{copy[2]}</button>
              : <button className="button button-primary" type="button" aria-disabled={preferences.busy} onClick={() => void dismiss("finished")}>Finish guide</button>}
            {step.kind !== "ready" && (step.kind === "blooms"
              ? <button type="button" className={styles.secondary} aria-disabled={preferences.busy} onClick={() => void dismiss("finished")}>Finish guide</button>
              : <button type="button" className={styles.secondary} aria-disabled={preferences.busy} onClick={() => void dismiss("skipped")}>Skip guide</button>)}
          </div>
          {step.kind !== "ready" && <small className={styles.reopen}>Reopen in Settings</small>}
          {paused && <p role="status" className={styles.status}>Garden updates are paused. Close this guide to refresh.</p>}
          {preferences.error && <div role="alert" className={styles.error}><p>{preferences.error}</p><button type="button" className="button button-secondary" aria-disabled={preferences.busy} onClick={() => { if (!preferences.busy) void preferences.refresh(); }}>Refresh settings</button></div>}
          </div></div>
          {/* The close stamp sits on the frame, outside the scrolling body. */}
          <Dialog.Close className={styles.close} aria-label="Close guide for now"><span aria-hidden="true">×</span></Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
