"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gardenBrowserClient } from "@/lib/auth/browser";
import { subscribeGarden } from "@/lib/garden/realtime";
import { loadMemories } from "./actions";
import {
  cursorFor,
  mergeMemories,
  MEMORY_PAGE_SIZE,
  type MemoryCursor,
  type MemoryFilters,
  type MemoryItem,
  type MemoryPage,
  type MemoryQuery,
} from "./model";
type State = {
  items: MemoryItem[];
  staged: MemoryItem[];
  oldest: MemoryCursor | null;
  newest: MemoryCursor | null;
  more: boolean;
  newerMore: boolean;
  ready: boolean;
  error: string | null;
};
const empty: MemoryPage = { items: [], more: false, error: null };
export function useMemories(
  initial: MemoryPage | undefined,
  filters: MemoryFilters,
) {
  const first = initial ?? empty;
  const [state, setState] = useState<State>({
    items: first.items,
    staged: [],
    oldest: first.items.length ? cursorFor(first.items.at(-1)!) : null,
    newest: first.items.length ? cursorFor(first.items[0]) : null,
    more: first.more,
    newerMore: false,
    ready: !!initial && !initial.error,
    error: first.error,
  });
  const current = useRef(state);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notice, setNotice] = useState("");
  const generation = useRef(0),
    mounted = useRef(false),
    lock = useRef(false),
    again = useRef(false);
  const apply = useCallback((change: (state: State) => State) => {
    const next = change(current.current);
    current.current = next;
    setState(next);
  }, []);
  const run = useCallback(
    async (kind: "refresh" | "older") => {
      if (!mounted.current) return;
      if (lock.current) {
        if (kind === "refresh") again.current = true;
        return;
      }
      lock.current = true;
      setBusy(true);
      setNotice("");
      const token = generation.current;
      const active = () => mounted.current && generation.current === token;
      const read = async (query: MemoryQuery) => {
        const result = await loadMemories(query);
        if (!active()) return null;
        if (result.error) throw new Error(result.error);
        return result;
      };
      apply((s) => ({ ...s, error: null }));
      try {
        do {
          again.current = false;
          const s = current.current;
          if (!s.ready || !s.newest) {
            const result = await read({ kind: "latest", filters });
            if (!result) return;
            apply((old) => ({
              ...old,
              items: result.items,
              ready: true,
              more: result.more,
              oldest: result.items.length
                ? cursorFor(result.items.at(-1)!)
                : null,
              newest: result.items.length ? cursorFor(result.items[0]) : null,
            }));
          } else if (kind === "older") {
            if (!s.oldest) return;
            const result = await read({
              kind: "older",
              filters,
              cursor: s.oldest,
            });
            if (!result) return;
            apply((old) => ({
              ...old,
              items: mergeMemories(old.items, result.items),
              more: result.more,
              oldest: result.items.length
                ? cursorFor(result.items.at(-1)!)
                : old.oldest,
            }));
          } else {
            // Refresh ALL loaded and staged identities. Plan edits can remove acceptance
            // rows, and an edited original may be far beyond the latest page.
            const known = mergeMemories(s.items, s.staged);
            for (
              let offset = 0;
              offset < known.length;
              offset += MEMORY_PAGE_SIZE
            ) {
              const keys = known
                .slice(offset, offset + MEMORY_PAGE_SIZE)
                .map((i) => i.key);
              const result = await read({ kind: "updates", filters, keys });
              if (!result) return;
              apply((old) => ({
                ...old,
                items: mergeMemories(
                  old.items,
                  result.items.filter((i) =>
                    old.items.some((x) => x.key === i.key),
                  ),
                ),
                staged: mergeMemories(
                  old.staged,
                  result.items.filter((i) =>
                    old.staged.some((x) => x.key === i.key),
                  ),
                ),
              }));
            }
            // Nearest newer rows arrive ascending. Advance only through returned rows,
            // never the lookahead, keeping the older-page boundary entirely separate.
            const result = await read({
              kind: "newer",
              filters,
              cursor: current.current.newest!,
            });
            if (!result) return;
            apply((old) => ({
              ...old,
              staged: mergeMemories(old.staged, result.items),
              newest: result.items.length
                ? cursorFor(result.items.at(-1)!)
                : old.newest,
              newerMore: result.more,
            }));
          }
          if (active()) setNotice("Saved memories refreshed.");
          kind = "refresh";
        } while (again.current && active());
      } catch {
        if (active())
          apply((s) => ({
            ...s,
            error:
              "Memories could not load. Your history is still saved; try again when connected.",
          }));
      } finally {
        if (active()) {
          lock.current = false;
          setBusy(false);
        }
      }
    },
    [apply, filters],
  );
  useEffect(() => {
    mounted.current = true;
    const effectGeneration = ++generation.current;
    lock.current = false;
    const resume = () => {
      if (document.visibilityState === "visible") void run("refresh");
    };
    const client = gardenBrowserClient();
    const stop = client
      ? subscribeGarden(client, resume, setConnected)
      : () => {};
    const initialRead = !initial
      ? window.setTimeout(() => void run("refresh"), 0)
      : undefined;
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    const timer = window.setInterval(resume, 60_000);
    return () => {
      mounted.current = false;
      generation.current = effectGeneration + 1;
      if (initialRead !== undefined) clearTimeout(initialRead);
      stop();
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [initial, run]);
  const showNewer = () => {
    apply((s) => ({
      ...s,
      items: mergeMemories(s.items, s.staged),
      staged: [],
    }));
    setNotice("Newer memories added above your saved history.");
  };
  return {
    ...state,
    busy,
    connected,
    notice,
    refresh: () => void run("refresh"),
    older: () => void run("older"),
    showNewer,
  };
}
