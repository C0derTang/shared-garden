"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
type Scope = { active: string | null; request: (id: string) => void; release: (id: string) => void };
const Context = createContext<Scope | null>(null);
/** A pending private moment waits for the active flower sheet without erasing its draft. */
export function SheetScope({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<string[]>([]);
  const request = useCallback((id: string) => setQueue((old) => old.includes(id) ? old : [...old, id]), []);
  const release = useCallback((id: string) => setQueue((old) => old.includes(id) ? old.filter((item) => item !== id) : old), []);
  const value = useMemo(() => ({ active: queue[0] ?? null, request, release }), [queue, request, release]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSheetScope() { return useContext(Context); }
