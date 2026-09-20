"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { readSettings, saveSetting } from "@/lib/settings/actions";
import type { SettingsResult, SettingChange } from "@/lib/settings/model";

type Preferences = SettingsResult & { guideRequest: number; busy: boolean; refresh: () => Promise<void>; save: (change: SettingChange) => Promise<boolean> };
const Context = createContext<Preferences | null>(null);
// Server-rendered and global: this also covers Radix portals before hydration.
const quietMotion = "*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }";
export function MemberPreferences({ initial, children }: { initial: SettingsResult; children: ReactNode }) {
  const [state, setState] = useState(initial.state);
  const [error, setError] = useState(initial.error);
  const [busy, setBusy] = useState(false);
  const [guideRequest, setGuideRequest] = useState(0);
  const latest = useRef(initial.state);
  const mounted = useRef(false);
  const saving = useRef(false);
  const generation = useRef(0);
  const reading = useRef<Promise<void> | null>(null);
  const apply = useCallback((result: SettingsResult) => {
    if (!mounted.current) return;
    if (result.state && (!latest.current || result.state.revision >= latest.current.revision)) {
      latest.current = result.state;
      setState(result.state);
    }
    setError(result.error);
  }, []);
  const refresh = useCallback((): Promise<void> => {
    if (reading.current) return reading.current;
    if (saving.current) return Promise.resolve();
    const version = generation.current;
    const work = (async () => {
      try {
        const result = await readSettings();
        if (version === generation.current) apply(result);
      } catch {
        if (version === generation.current) apply({ state: null, error: "Your settings could not refresh. Please try again." });
      }
    })();
    reading.current = work;
    void work.finally(() => { reading.current = null; });
    return work;
  }, [apply]);
  const save = useCallback(async (change: SettingChange) => {
    if (saving.current || !navigator.onLine) {
      if (mounted.current && !navigator.onLine) setError("You are offline. Reconnect to save this setting.");
      return false;
    }
    saving.current = true;
    generation.current++;
    setBusy(true);
    try {
      const result = await saveSetting(change);
      apply(result);
      if (mounted.current && result.state && "guide" in change && change.guide === "open") setGuideRequest((value) => value + 1);
      return result.state !== null;
    } catch {
      apply({ state: null, error: "This setting was not confirmed. Refresh to check before trying again." });
      return false;
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [apply]);
  useEffect(() => {
    mounted.current = true;
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(focus, 30000);
    void refresh();
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [refresh]);
  return <Context.Provider value={{ state, error, busy, refresh, save, guideRequest }}>
    {!state?.gentle_motion && <style data-member-motion="off">{quietMotion}</style>}
    {children}
  </Context.Provider>;
}
export function useMemberPreferences() { return useContext(Context); }
