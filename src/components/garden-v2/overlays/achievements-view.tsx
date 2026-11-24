"use client";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { readAchievementsV2 } from "@/lib/garden-v2/achievement-actions";
import { V2_ACHIEVEMENT_COUNT, type AchievementStateV2, type AchievementV2 } from "@/lib/garden-v2/achievements";
import { gardenDayLabel } from "@/lib/garden-v2/flowers";
import { subscribeGardenV2 } from "@/lib/garden-v2/realtime";
import v2 from "../garden-v2.module.css";
import { pacificMoment } from "./memory-card";
import styles from "./overlays.module.css";

/** A small painted mark per badge (presentation only; titles and rules are the server's). */
function glyph(id: string) {
  if (id.startsWith("streak-") || id === "ten-minutes" || id === "before-noon") return "♡";
  if (id === "first-seed" || id === "all-planted") return "❦";
  if (id === "daisy-20" || id === "mood-match-3") return "❀";
  if (id === "wishes-5" || id === "first-wish-blown") return "✧";
  return "✿";
}

function useAchievements() {
  const [state, setState] = useState<AchievementStateV2 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const mounted = useRef(false);
  const pending = useRef(false);
  const again = useRef(false);
  const refresh = useCallback(async () => {
    if (pending.current) {
      again.current = true;
      return;
    }
    pending.current = true;
    setBusy(true);
    try {
      do {
        again.current = false;
        const result = await readAchievementsV2();
        if (!mounted.current) return;
        if (result.state) {
          const next = result.state;
          // Never let an older response replace newer progress.
          setState((old) => (!old || Date.parse(next.server_now) >= Date.parse(old.server_now) ? next : old));
        }
        setError(result.error);
      } while (again.current && mounted.current);
    } catch {
      if (mounted.current) setError("Achievements could not refresh. Check your connection and try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const client = gardenBrowserClient();
    const stop = client ? subscribeGardenV2(client, () => void refresh(), setConnected) : () => {};
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const first = window.setTimeout(() => void refresh(), 0);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    // Rollover has no browser event; a modest visible-page poll notices it.
    const interval = window.setInterval(resume, 60_000);
    return () => {
      mounted.current = false;
      stop();
      window.clearTimeout(first);
      window.clearInterval(interval);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  return { state, error, busy, connected, refresh };
}

function Badge({ item, open, onToggle }: { item: AchievementV2; open: boolean; onToggle: () => void }) {
  const earned = item.earned_at !== null;
  const fraction = Math.min(1, item.progress / item.target);
  const detailId = `v2-achievement-${item.achievement_id}`;
  return (
    <li className={styles.badgeItem} data-earned={earned || undefined} data-open={open || undefined}>
      <button
        type="button"
        className={styles.badge}
        aria-expanded={open}
        aria-controls={detailId}
        aria-label={`${item.title}, ${earned ? "earned" : "growing"}, ${item.progress} of ${item.target} ${item.unit}`}
        onClick={onToggle}
      >
        <span className={styles.medal} style={{ "--fill": `${fraction * 360}deg` } as CSSProperties} aria-hidden="true">
          <span>{glyph(item.achievement_id)}</span>
        </span>
        <span className={styles.badgeTitle}>{item.title.toLowerCase()}</span>
        <span className={styles.badgeProgress} aria-hidden="true">
          {earned ? `earned ${gardenDayLabel(item.earned_day!)}` : `${item.progress} of ${item.target}`}
        </span>
      </button>
      {open && (
        <div id={detailId} className={styles.badgeDetail}>
          <h3 className={styles.detailTitle}>{item.title}</h3>
          <p>{item.requirement}</p>
          <p className={styles.meta}>
            {earned ? "earned" : "growing"} · {item.progress} of {item.target} {item.unit}
          </p>
          <progress className={styles.progress} max={item.target} value={item.progress} aria-label={`${item.title} progress`} />
          {earned && (
            <p className={styles.earned}>
              earned on garden day {gardenDayLabel(item.earned_day!)} ·{" "}
              <time dateTime={item.earned_at!}>{pacificMoment(item.earned_at!)}</time>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The new garden's achievements: its own 25 badges (decision 0067, #177), as
 * painted medals that fill as they grow and glow once earned, with the garden
 * day each was earned. Tapping a medal shows how it grows.
 */
export function AchievementsView() {
  const { state, error, busy, connected, refresh } = useAchievements();
  const [open, setOpen] = useState<string | null>(null);
  const earned = state?.achievements.filter((a) => a.earned_at !== null).length ?? 0;
  return (
    <div className={styles.stack}>
      <div className={styles.feedBar}>
        {state && (
          <p className={styles.summary}>
            <strong aria-live="polite">
              {earned} of {V2_ACHIEVEMENT_COUNT} earned
            </strong>
            <span>
              <span aria-hidden="true">♡ </span>
              {state.current_streak}-day streak
            </span>
          </p>
        )}
        <span className={styles.live} data-live={connected || undefined}>
          {connected ? "live" : "not live"}
          <span className={v2.srOnly}>{connected ? " updates" : ", refresh to check"}</span>
        </span>
        <button type="button" className={v2.textButton} disabled={busy} onClick={() => void refresh()} aria-label="Refresh achievements">
          {busy ? "refreshing…" : "refresh"}
        </button>
      </div>
      {error && (
        <p className={v2.error} role="alert">
          {error} {state ? "Showing the last saved progress." : ""}
        </p>
      )}
      {!state && !error && (
        <p role="status" className={styles.feedStatus}>
          Loading achievements…
        </p>
      )}
      {state && earned === 0 && <p className={styles.empty}>No medals yet. Each one glows gold the day you earn it together.</p>}
      {state && (
        <ol className={styles.badges}>
          {state.achievements.map((item) => (
            <Badge
              key={item.achievement_id}
              item={item}
              open={open === item.achievement_id}
              onToggle={() => setOpen(open === item.achievement_id ? null : item.achievement_id)}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
