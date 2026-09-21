"use client";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlowerSprite } from "@/components/garden/flower-sprite";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useSheetScope } from "@/components/ui/sheet-scope";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { subscribeInteraction } from "@/lib/private-interaction/realtime";
import { answerPrivateInteraction, controlPrivateInteraction, previewPrivateInteraction, readPrivateInteraction } from "@/lib/private-interaction/actions";
import type { OwnerDetail, InteractionContent, InteractionResult, InteractionState } from "@/lib/private-interaction/model";
import styles from "./private-interaction.module.css";

const celebrationFlowers = ["rose", "cactus", "tulip", "marigold", "daisy", "hydrangea", "sunflower", "snapdragon", "moonflower", "bluebell", "dandelion", "forget-me-not", "peony"] as const;

function Moment({ content, preview = false, busy, save }: { content: InteractionContent; preview?: boolean; busy: boolean; save: (key: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const choice = content.choices.find((item) => item.key === selected);
  return <div className={styles.moment}>
    <div className={styles.bloom} aria-hidden="true">
      {celebrationFlowers.map((type) => <FlowerSprite key={type} type={type} growthUnits={0} growthTarget={1} bloomed={false} presentation="full-bloom" decorative size={32} />)}
    </div>
    <p className={styles.message}>{content.message}</p>
    <div className={styles.choices} aria-label="Choose your answer">
      {content.choices.map((item) => <button key={item.key} type="button" aria-pressed={selected === item.key} disabled={busy} onClick={() => setSelected(item.key)}>{item.label}</button>)}
    </div>
    <p aria-live="polite">{preview ? (choice ? "Preview selection only. Nothing was sent." : "Try a choice to see how it looks.") : (choice ? `Your choice: ${choice.label}` : "Take your time. You can close this and return whenever you like.")}</p>
    {!preview && <>
      <p className={styles.quiet}>Once saved, your answer stays as chosen.</p>
      <button className="button button-primary" type="button" disabled={!choice || busy} onClick={() => choice && save(choice.key)}>{busy ? "Saving…" : "Save my answer"}</button>
    </>}
  </div>;
}

function OwnerControls({ detail, busy: saving, change, setError }: { detail: OwnerDetail; busy: boolean; change: (armed: boolean) => Promise<void>; setError: (error: string | null) => void }) {
  const [preview, setPreview] = useState<InteractionContent | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setBusy] = useState(false);
  const busy = saving || loading;
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const showPreview = async () => {
    setBusy(true);
    try {
      const result = await previewPrivateInteraction();
      if (!mounted.current) return;
      setPreview(result.content); setError(result.error); setPreviewOpen(!!result.content);
    } catch { if (mounted.current) { setPreview(null); setError("Preview could not open. Please try again."); } }
    finally { if (mounted.current) setBusy(false); }
  };
  const status = detail.status === "answered"
    ? "Answered · This moment will not repeat."
    : detail.status === "pending"
      ? detail.armed ? "Pending · Delivery is armed." : "Pending · Delivery is paused."
      : detail.armed ? "Armed · Waiting for all 26 achievements." : "Disarmed · Delivery is paused.";
  return <div className={styles.controls}>
      <p className="eyebrow">PRIVATE OWNER CONTROLS</p><h2>Garden moment</h2>
      {detail.status === "unconfigured" ? <p>Your private moment has not been configured.</p> : <>
        <p className={styles.deliveryStatus} role="status" aria-label="Delivery status">{status}</p>
        <div className={styles.controlButtons}>
          <BottomSheet
            open={previewOpen}
            onOpenChange={(next) => {
              if (next) void showPreview();
              else { setPreviewOpen(false); setPreview(null); }
            }}
            title="Preview — nothing will be sent"
            description={preview?.title ?? "Your private garden moment preview."}
            trigger={<button className="button button-secondary" type="button" disabled={busy}>Preview privately</button>}
          >
            {preview && <Moment content={preview} preview busy={false} save={() => {}} />}
          </BottomSheet>
          <button className="button button-secondary" type="button" disabled={busy || detail.status === "answered"} onClick={() => void change(!detail.armed)}>{detail.armed ? "Disarm delivery" : "Arm delivery"}</button>
        </div>
        {detail.answer && !detail.unread && <p>Saved answer: {detail.answer.label}</p>}
      </>}
    </div>;
}

/** Mount only inside the member-guarded garden layout. Each action reauthorizes. */
export function PrivateInteraction({ ownerControls, ownerContainer, noticeContainer, onMomentCloseAutoFocus }: { ownerControls: boolean; ownerContainer?: HTMLElement | null; noticeContainer?: HTMLElement | null; onMomentCloseAutoFocus?: (event: Event) => void }) {
  const scope = useSheetScope();
  const [state, setState] = useState<InteractionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const mounted = useRef(false);
  const dismissed = useRef(false);
  const reading = useRef(false);
  const repeat = useRef(false);
  const generation = useRef(0);
  const applying = useRef(false);
  const apply = useCallback((result: InteractionResult) => {
    // Failed authorization/network checks must not leave stale private copy open.
    setState(result.state);
    setError(result.error);
    if (result.state?.status === "pending") {
      if (!dismissed.current) setOpen(true);
    } else setOpen(false);
  }, []);
  const refresh = useCallback(async () => {
    if (reading.current || applying.current) { repeat.current = true; return; }
    reading.current = true;
    try {
      do {
        repeat.current = false;
        const version = generation.current;
        let result: InteractionResult;
        try { result = await readPrivateInteraction(); }
        catch { result = { state: null, error: "This moment could not refresh. Please try again." }; }
        if (!mounted.current) return;
        if (generation.current === version) apply(result);
      } while (repeat.current && mounted.current && !applying.current);
    } finally { reading.current = false; }
  }, [apply]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const client = gardenBrowserClient();
    const stop = client ? subscribeInteraction(client, () => void refresh()) : () => {};
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(resume, 15_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      mounted.current = false;
      stop(); clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  const mutate = async (operation: () => Promise<InteractionResult>, answer = false) => {
    if (applying.current) return;
    applying.current = true;
    generation.current++;
    setBusy(true);
    try {
      const result = await operation();
      if (mounted.current) { apply(result); if (answer && result.state?.status === "answered") setSaved(true); }
    } catch { if (mounted.current) apply({ state: null, error: "This change was not confirmed. Refresh to check its saved state." }); }
    finally {
      applying.current = false;
      if (mounted.current) { setBusy(false); if (repeat.current) void refresh(); }
    }
  };
  const detail = state?.status === "owner" ? state.detail : null;
  const controls = ownerControls && detail;
  const notification = detail?.unread && detail.answer;
  if (!error && !saved && !controls && !notification && state?.status !== "pending") return null;
  const ownerContent = controls && <OwnerControls detail={detail} busy={busy} change={(armed) => mutate(() => controlPrivateInteraction("arm", armed))} setError={setError} />;
  const notices = (error || saved || notification) && <div className={styles.noticeStack}>
    {error && <div className={styles.notice}><p role="alert">{error}</p><button type="button" onClick={() => void refresh()}>Refresh moment</button></div>}
    {saved && <p role="status" className={styles.notice}>Your answer is saved. Your garden keeps growing.</p>}
    {notification && <div className={styles.notice} role="status">
      <h2>A new answer is here</h2><p>{notification.label}</p>
      <p><time dateTime={notification.answered_at}>{new Date(notification.answered_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })}</time> · Pacific time</p>
      <button type="button" disabled={busy} onClick={() => void mutate(() => controlPrivateInteraction("acknowledge", undefined))}>Mark as read</button>
    </div>}
  </div>;
  const activeNoticeContainer = scope?.active ? scope.noticeContainer : noticeContainer;
  const presentedNotices = notices && (activeNoticeContainer
    ? createPortal(notices, activeNoticeContainer)
    : scope?.active || noticeContainer === null
      ? null
      : <div className={styles.gardenNoticeHost} data-private-notice-host="garden">{notices}</div>);
  return <section className={styles.container} aria-label="Garden moment">
    {presentedNotices}
    {state?.status === "pending" && <BottomSheet
      onCloseAutoFocus={onMomentCloseAutoFocus}
      open={open} onOpenChange={(next) => { setOpen(next); if (!next) dismissed.current = true; }}
      title={state.content.title} description="A moment for your shared garden."
      trigger={<button className="button button-primary" type="button">Open your garden moment</button>}>
      {open && <Moment content={state.content} busy={busy} save={(key) => void mutate(() => answerPrivateInteraction(key), true)} />}
    </BottomSheet>}
    {ownerContainer === undefined ? ownerContent : ownerContainer && ownerContent && createPortal(ownerContent, ownerContainer)}
  </section>;
}
