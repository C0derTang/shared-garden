"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { mutateGarden, refreshGarden } from "./actions";
import { subscribeGarden } from "./realtime";
import type { GardenCommand, GardenResult, GardenState } from "./model";

export function useGarden(initial: GardenResult) {
  const [snapshot, setSnapshot] = useState<{
    state: GardenState | null;
    received: number;
  }>({ state: initial.state, received: 0 });
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
      const received = performance.now() - started.current;
      setSnapshot((old) =>
        !old.state ||
        Date.parse(state.server_now) >= Date.parse(old.state.server_now)
          ? { state, received }
          : old,
      );
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
    async (command: GardenCommand): Promise<GardenResult> => {
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
      // Avoid an older read replacing feedback from this mutation.
      await pendingRead.current;
      let result: GardenResult;
      try {
        result = await mutateGarden(command);
      } catch {
        result = {
          state: null,
          error:
            "We could not confirm the save. Your draft is here. Refresh and check today's entries before trying again.",
          saved: false,
        };
      }
      apply(result);
      pendingMutation.current = false;
      if (mounted.current) setBusy(false);
      if (!result.state || readAgain.current) {
        readAgain.current = false;
        void refresh();
      }
      return result;
    },
    [apply, refresh],
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
