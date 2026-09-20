"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { subscribeGarden } from "@/lib/garden/realtime";
import { readAchievements } from "@/lib/achievements/actions";
import { PixelIcon } from "@/components/ui/pixel-icon";
import type { AchievementResult } from "@/lib/achievements/model";
import styles from "./achievements.module.css";

// Presentation labels only; titles, requirements and awards remain server-owned.
const badgeLabels: Record<string, string> = {
  "first-seed": "First seed", "first-bloom": "First bloom",
  "all-planted": "Every type planted", "all-bloomed": "Every type bloomed",
  "streak-3": "3-day streak", "streak-7": "7-day streak",
  "streak-14": "14-day streak", "streak-21": "21-day streak",
  recovery: "Recovery", "roses-5": "Five Roses", "marigolds-10": "Ten Marigolds",
  "tulips-3": "Three Tulips", "daisy-20": "20 Daisy questions",
  "forget-me-nots-3": "Three Forget-me-nots", "wishes-5": "Five wishes",
  "ten-minutes": "Within 10 minutes", "before-noon": "Before noon",
  moonflower: "Moonflower", snapdragon: "Snapdragon", bluebell: "Bluebell",
  "mood-match-3": "Three mood matches", peony: "Peony",
  "first-wish-blown": "A wish fulfilled", "coexisting-5": "Five blooms together",
  "blooms-10": "Ten blooms", "blooms-20": "Twenty blooms",
};

export function AchievementsClient({
  initial,
}: {
  initial: AchievementResult;
}) {
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
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
        const result = await readAchievements();
        if (!mounted.current) return;
        if (result.state) {
          const next = result.state;
          setState((old) =>
            !old || Date.parse(next.server_now) >= Date.parse(old.server_now)
              ? next
              : old,
          );
        }
        setError(result.error);
      } while (again.current && mounted.current);
    } catch {
      if (mounted.current)
        setError(
          "Achievements could not refresh. Check your connection and try again.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const client = gardenBrowserClient();
    const stop = client
      ? subscribeGarden(
          client,
          () => {
            void refresh();
          },
          setConnected,
        )
      : () => {};
    const resume = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    // Rollover has no browser event. A modest visible-page poll also recovers
    // missed partner events without asking the client to evaluate any rule.
    const interval = window.setInterval(resume, 60_000);
    return () => {
      mounted.current = false;
      stop();
      clearInterval(interval);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  const earned = state?.achievements.filter((a) => a.earned_at !== null).length;
  return (
    <section className={styles.collection} aria-labelledby="achievements-title">
      <h1 id="achievements-title" className={styles.screenReader}>Little milestones</h1>
      <header className={styles.intro}>
        {state && <div className={styles.summary}>
          <strong aria-live="polite">{earned} of 26 earned</strong>
          <span aria-label={`Current shared streak: ${state.current_streak} completed days`}>{state.current_streak}-day streak</span>
          <progress aria-label="Ordinary achievements earned" max={26} value={earned} />
          {earned === 26 && <span className={styles.complete}>All milestones earned ✿</span>}
        </div>}
        <div className={styles.refresh}>
          <span aria-label={connected ? "Partner updates connected" : "Refresh to check for partner updates"}>{connected ? "● Live" : "Check for updates"}</span>
          <button type="button" aria-label="Refresh achievements" onClick={() => void refresh()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {error && <p role="alert">{error} {state ? "Showing the last saved progress." : ""}</p>}
      </header>
      {state && <ol className={styles.list}>
        {state.achievements.map((item) => {
          const isEarned = item.earned_at !== null;
          const isOpen = expanded === item.achievement_id;
          const status = isEarned ? "Earned" : "Growing";
          const icon = item.achievement_id.startsWith("streak-") || item.achievement_id === "ten-minutes" ? "heart"
            : item.achievement_id === "daisy-20" ? "book"
            : item.achievement_id === "first-seed" || item.achievement_id === "all-planted" || item.achievement_id === "recovery" ? "sprout" : "flower";
          return <li key={item.achievement_id} className={`${isEarned ? styles.earned : styles.growing} ${isOpen ? styles.expanded : ""}`}>
            <button type="button" className={styles.badge}
              aria-label={`${item.title}, ${status}, ${item.progress} of ${item.target} ${item.unit}`}
              aria-expanded={isOpen} aria-controls={`achievement-detail-${item.achievement_id}`}
              onClick={() => setExpanded(isOpen ? null : item.achievement_id)}>
              <span className={styles.emblem} aria-hidden="true"><PixelIcon name={icon} /><span>{isEarned ? "✓" : "◇"}</span></span>
              <strong>{badgeLabels[item.achievement_id] ?? item.title}</strong>
              <span className={styles.status}>{status} · {item.progress}/{item.target}</span>
              <span className={styles.cue}>{isOpen ? "Hide details −" : "Details +"}</span>
            </button>
            {isOpen && <div id={`achievement-detail-${item.achievement_id}`} className={styles.detail}>
              <h2>{item.title}</h2>
              <p>{item.requirement}</p>
              <p className={styles.exactProgress}>{status} · {item.progress} / {item.target} {item.unit}</p>
              <progress aria-label={`${item.title} progress`} max={item.target} value={item.progress} />
              {item.earned_at && <p className={styles.date}>Earned <time dateTime={item.earned_at}>
                {new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" }).format(new Date(item.earned_at))}
              </time></p>}
            </div>}
          </li>;
        })}
      </ol>}
    </section>
  );
}
