"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
type NoticeHost = { id: string; element: HTMLElement };
type Scope = {
  active: string | null;
  noticeContainer: HTMLElement | null;
  request: (id: string) => void;
  release: (id: string) => void;
  registerNoticeContainer: (id: string, element: HTMLElement | null) => void;
};
const Context = createContext<Scope | null>(null);
/** A pending private moment waits for the active flower sheet without erasing its draft. */
export function SheetScope({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<string[]>([]);
  const [noticeHost, setNoticeHost] = useState<NoticeHost | null>(null);
  const request = useCallback((id: string) => setQueue((old) => old.includes(id) ? old : [...old, id]), []);
  const release = useCallback((id: string) => setQueue((old) => old.includes(id) ? old.filter((item) => item !== id) : old), []);
  const registerNoticeContainer = useCallback((id: string, element: HTMLElement | null) => {
    setNoticeHost((old) => {
      if (!element) return old?.id === id ? null : old;
      return old?.id === id && old.element === element ? old : { id, element };
    });
  }, []);
  const active = queue[0] ?? null;
  const value = useMemo(() => ({
    active,
    noticeContainer: noticeHost?.id === active ? noticeHost.element : null,
    request,
    release,
    registerNoticeContainer,
  }), [active, noticeHost, request, release, registerNoticeContainer]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSheetScope() { return useContext(Context); }
