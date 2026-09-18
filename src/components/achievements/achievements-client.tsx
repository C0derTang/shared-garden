"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { subscribeGarden } from "@/lib/garden/realtime";
import { readAchievements } from "@/lib/achievements/actions";
import type { AchievementResult } from "@/lib/achievements/model";
import styles from "./achievements.module.css";

export function AchievementsClient({
  initial,
}: {
  initial: AchievementResult;
}) {
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
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
      <header className={styles.intro}>
        <p className={styles.eyebrow}>Grown together</p>
        <h1 id="achievements-title">Little milestones</h1>
        <p>
          Every small act adds up. Earned achievements stay with your shared
          garden.
        </p>
        {state && (
          <div className={styles.summary}>
            <strong aria-live="polite">{earned} of 26 earned</strong>
            <progress
              aria-label="Ordinary achievements earned"
              max={26}
              value={earned}
            />
            <p>
              {earned === 26
                ? "All 26 milestones earned. Your garden keeps growing."
                : "There is no deadline. Keep growing at your own pace."}
            </p>
            <p>
              Current shared streak: {state.current_streak} completed{" "}
              {state.current_streak === 1 ? "day" : "days"}. Streak cards keep
              your longest run.
            </p>
          </div>
        )}
        <div className={styles.refresh}>
          <span>
            {connected
              ? "Partner updates connected"
              : "Refresh to check for partner updates"}
          </span>
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh achievements"}
          </button>
        </div>
        {error && (
          <p role="alert">
            {error} {state ? "Showing the last saved progress." : ""}
          </p>
        )}
      </header>
      {state && (
        <ol className={styles.list}>
          {state.achievements.map((item) => (
            <li
              key={item.achievement_id}
              className={item.earned_at ? styles.earned : styles.growing}
            >
              <div className={styles.cardHeading}>
                <span aria-hidden="true">{item.earned_at ? "✿" : "◇"}</span>
                <h2>{item.title}</h2>
              </div>
              <p>{item.requirement}</p>
              <div className={styles.status}>
                <strong>{item.earned_at ? "Earned" : "Growing"}</strong>
                <span>
                  {item.progress} / {item.target} {item.unit}
                </span>
              </div>
              <progress
                aria-label={`${item.title} progress`}
                max={item.target}
                value={item.progress}
              />
              {item.earned_at && (
                <p className={styles.date}>
                  Earned{" "}
                  <time dateTime={item.earned_at}>
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Los_Angeles",
                      dateStyle: "medium",
                    }).format(new Date(item.earned_at))}
                  </time>
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
