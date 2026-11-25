"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaMutate } from "@/lib/media/use-photo-draft";
import {
  canEditContribution,
  pacificCandidates,
  pacificLocal,
  type PeonyCommand,
  type PeonyState,
} from "./model";

/** The four shared milestones, in order. */
export const PEONY_TITLES = [
  "Propose ideas",
  "Agree on a plan",
  "Confirm your date happened",
  "Share favorite moments",
];

export type PeonyResultLike = {
  state: PeonyState | null;
  error: string | null;
  saved?: boolean;
};
/** A garden's Peony Server Actions (legacy or new garden). */
export type PeonyActions = {
  read: (flowerId: string) => Promise<PeonyResultLike>;
  mutate: (flowerId: string, command: PeonyCommand) => Promise<PeonyResultLike>;
};

export type PeonyTextDraft = { milestone: number; id?: number; text: string };
export type PeonyPlanDraft = {
  version: number;
  activity: string;
  local: string;
  instant: string;
};

/** A contribution's text: 1–4,000 characters and a bounded payload. */
export function peonyTextValid(text: string) {
  return (
    text.trim().length > 0 &&
    Array.from(text.trim()).length <= 4000 &&
    new TextEncoder().encode(JSON.stringify({ text: text.trim() })).length <=
      20000
  );
}

/** A plan's activity: 1–2,000 characters and at most 8,000 bytes. */
export function peonyActivityValid(activity: string) {
  return (
    !!activity.trim() &&
    Array.from(activity.trim()).length <= 2000 &&
    new TextEncoder().encode(activity.trim()).length <= 8000
  );
}

/**
 * The exact instant a plan draft names in Pacific time: its candidates (two
 * when a fall-back hour repeats, none when it does not exist), the chosen one
 * and whether that choice is still one of the candidates.
 */
export function peonyPlanInstant(plan: PeonyPlanDraft | null) {
  const candidates = plan ? pacificCandidates(plan.local) : [];
  const chosen =
    plan?.instant && pacificLocal(plan.instant) === plan.local
      ? plan.instant
      : candidates.length === 1
        ? candidates[0]
        : "";
  const valid =
    !!chosen &&
    candidates.some(
      (candidate) =>
        Math.floor(Date.parse(candidate) / 60000) ===
        Math.floor(Date.parse(chosen) / 60000),
    );
  return { candidates, chosen, valid };
}

/**
 * A Peony's four shared milestones, shared by the legacy and new gardens: a
 * monotonic read of the Peony state, one guarded save at a time through the
 * garden's external mutation (so the garden refreshes after it), and the text
 * and plan drafts that survive refusals. The view decides how it looks.
 */
export function usePeonyMilestones({
  flowerId,
  refreshKey,
  now,
  busy,
  mutate,
  actions,
}: {
  flowerId: string;
  refreshKey: string;
  now: number;
  busy: boolean;
  mutate: MediaMutate;
  actions: PeonyActions;
}) {
  const [state, setState] = useState<PeonyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [stale, setStale] = useState(true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState<PeonyTextDraft | null>(null);
  const [plan, setPlan] = useState<PeonyPlanDraft | null>(null);
  const mounted = useRef(false),
    lock = useRef(false),
    generation = useRef(0);
  const { read, mutate: mutatePeony } = actions;
  const apply = useCallback((r: PeonyResultLike) => {
    if (!mounted.current) return;
    if (r.state)
      setState((old) =>
        !old || Date.parse(r.state!.server_now) >= Date.parse(old.server_now)
          ? r.state
          : old,
      );
    setStale(!r.state);
    setReadError(r.error);
  }, []);
  const refresh = useCallback(async () => {
    const token = ++generation.current;
    try {
      const r = await read(flowerId);
      if (token === generation.current) apply(r);
    } catch {
      if (token === generation.current)
        apply({
          state: null,
          error: "Peony could not refresh. Your draft is here; try again.",
        });
    }
  }, [flowerId, apply, read]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh, refreshKey]);
  async function save(command: PeonyCommand) {
    if (lock.current || busy || stale) return;
    lock.current = true;
    setPending(true);
    setSaved(false);
    setError(null);
    generation.current++;
    let detail: string | null = null;
    try {
      const result = await mutate({
        kind: "external",
        run: async (checkCurrent) => {
          checkCurrent();
          const r = await mutatePeony(flowerId, command);
          apply(r);
          detail = r.error;
          if (!r.saved) throw Error("Peony save unconfirmed");
        },
      });
      if (result.saved) {
        setText(null);
        setPlan(null);
        setSaved(true);
      } else setError(detail ?? result.error);
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const blocked =
    busy ||
    pending ||
    stale ||
    !!(state && now >= Date.parse(state.next_rollover_at));
  const { candidates, chosen, valid: validInstant } = peonyPlanInstant(plan);
  const validText = !!text && peonyTextValid(text.text);
  const currentEdit = text?.id
    ? state?.contributions.find((c) => c.id === text.id)
    : null;
  const editableText =
    !!text &&
    state?.next_milestone === text.milestone &&
    (!text.id || (!!currentEdit && canEditContribution(currentEdit, now)));
  const planChanged = !!plan && plan.version !== (state?.plan?.version ?? 0);
  return {
    state,
    error,
    readError,
    stale,
    pending,
    saved,
    setSaved,
    text,
    setText,
    plan,
    setPlan,
    refresh,
    save,
    blocked,
    candidates,
    chosen,
    validInstant,
    validText,
    editableText,
    planChanged,
  };
}
