"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { mutateGarden, refreshGarden } from "./actions";
import { subscribeGarden } from "./realtime";
import type { GardenCommand, GardenResult, GardenState } from "./model";

export type GardenMutation =
  | GardenCommand
  | {
      kind: "external";
      run: (checkCurrent: () => void) => Promise<void>;
    };

export function useGarden(initial: GardenResult) {
  const [snapshot, setSnapshot] = useState<{
    state: GardenState | null;
    received: number;
  }>({ state: initial.state, received: 0 });
  const latestSnapshot = useRef(snapshot);
  const renderedDay = snapshot.state?.garden_day;
  const [error, setError] = useState(initial.error);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mounted = useRef(false);
  const started = useRef(0);
  const pendingMutation = useRef(false);
  const pendingRead = useRef<Promise<void> | null>(null);
  const readAgain = useRef(false);
  const lastBoundaryAttempt = useRef(0);
  const apply = useCallback((result: GardenResult) => {
    if (!mounted.current) return;
    if (result.state) {
      const state = result.state;
      const elapsed = performance.now() - started.current;
      const old = latestSnapshot.current;
      if (
        !old.state ||
        Date.parse(state.server_now) >= Date.parse(old.state.server_now)
      ) {
        const previousNow = old.state
          ? Date.parse(old.state.server_now) +
            Math.max(0, elapsed - old.received)
          : 0;
        // A delayed pre-rollover response cannot rewind an already crossed
        // boundary. Keep the clock monotonic without changing server fields.
        const received =
          elapsed - Math.max(0, previousNow - Date.parse(state.server_now));
        const next = { state, received };
        // A waiting mutation resumes before React necessarily commits a render.
        latestSnapshot.current = next;
        setSnapshot(next);
      }
    }
    setError(result.error);
  }, []);
  const refresh = useCallback((): Promise<void> => {
    if (pendingMutation.current || pendingRead.current) {
      readAgain.current = true;
      return pendingRead.current ?? Promise.resolve();
    }
    const work = (async () => {
      do {
        readAgain.current = false;
        try {
          apply(await refreshGarden());
        } catch {
          if (mounted.current)
            setError(
              "The garden could not refresh. Check your connection and try again.",
            );
        }
      } while (
        readAgain.current &&
        !pendingMutation.current &&
        mounted.current
      );
    })();
    pendingRead.current = work;
    void work.finally(() => {
      pendingRead.current = null;
    });
    return work;
  }, [apply]);
  const mutate = useCallback(
    async (command: GardenMutation): Promise<GardenResult> => {
      if (pendingMutation.current)
        return {
          state: null,
          error: "Please wait for the current save.",
          saved: false,
        };
      if (!navigator.onLine)
        return {
          state: null,
          error:
            "You are offline. Your draft is here; reconnect before saving. Nothing has been queued.",
          saved: false,
        };
      pendingMutation.current = true;
      setBusy(true);
      let result: GardenResult;
      try {
        // Reads may move the day while a clicked command is waiting. Revalidate
        // synchronously before sending it; no client day/time reaches the RPC.
        await pendingRead.current;
        const latest = latestSnapshot.current;
        const current = latest.state;
        const calibratedNow = current
          ? Date.parse(current.server_now) +
            Math.max(0, performance.now() - started.current - latest.received)
          : 0;
        if (
          !current ||
          current.garden_day !== renderedDay ||
          calibratedNow >= Date.parse(current.next_rollover_at)
        ) {
          result = {
            state: null,
            saved: false,
            error:
              "The garden day is changing. Your draft is here; wait for the current day, then review it before saving.",
          };
        } else {
          if (command.kind === "external") {
            const checkCurrent = () => {
              const latest = latestSnapshot.current;
              const state = latest.state;
              const instant = state
                ? Date.parse(state.server_now) +
                  Math.max(
                    0,
                    performance.now() - started.current - latest.received,
                  )
                : 0;
              if (
                !mounted.current ||
                !state ||
                state.garden_day !== renderedDay ||
                instant >= Date.parse(state.next_rollover_at)
              )
                throw new Error(
                  "The garden day changed. Review your draft before saving.",
                );
            };
            checkCurrent();
            await command.run(checkCurrent);
            result = { ...(await refreshGarden()), saved: true };
          } else result = await mutateGarden(command);
        }
      } catch {
        result = {
          state: null,
          error:
            "We could not confirm the save. Your draft is here. Refresh and check today's entries before trying again.",
          saved: false,
        };
      } finally {
        pendingMutation.current = false;
        if (mounted.current) setBusy(false);
      }
      apply(result);
      if (!result.state || readAgain.current) {
        readAgain.current = false;
        void refresh();
      }
      return result;
    },
    [apply, refresh, renderedDay],
  );
  useEffect(() => {
    mounted.current = true;
    // Initial server markup uses server_now; elapsed time begins at hydration.
    started.current = performance.now();
    const tick = setInterval(
      () => setElapsed(performance.now() - started.current),
      1000,
    );
    const client = gardenBrowserClient();
    const unsubscribe = client
      ? subscribeGarden(client, () => void refresh(), setConnected)
      : () => {};
    const focus = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const offline = () => {
      setConnected(false);
      setError(
        "You are offline. Showing the last garden update; posting needs a connection.",
      );
    };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", focus);
    const poll = setInterval(focus, 30000);
    void refresh();
    return () => {
      mounted.current = false;
      clearInterval(tick);
      clearInterval(poll);
      unsubscribe();
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  // Performance time is monotonic; no client date/day is ever sent to the server.
  const now = snapshot.state
    ? Date.parse(snapshot.state.server_now) +
      Math.max(0, elapsed - snapshot.received)
    : 0;
  const state = snapshot.state;
  useEffect(() => {
    if (!state) return;
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date(now)),
    );
    const crossed =
      now >= Date.parse(state.next_rollover_at) ||
      state.moonflower_open !== (hour >= 22 || hour < 4);
    if (crossed && performance.now() - lastBoundaryAttempt.current > 5000) {
      lastBoundaryAttempt.current = performance.now();
      void refresh();
    }
  }, [now, state, refresh]);
  return { state, now, error, connected, busy, refresh, mutate };
}
