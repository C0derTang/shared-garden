"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readPeony, mutatePeony, type PeonyResult } from "@/lib/peony/actions";
import {
  canEditContribution,
  pacificCandidates,
  pacificDate,
  pacificLocal,
  type PeonyState,
  type PeonyCommand,
} from "@/lib/peony/model";
import type { Mutate } from "./seed-picker";
import styles from "./garden.module.css";
const titles = [
  "Propose ideas",
  "Agree on a plan",
  "Confirm your date happened",
  "Share favorite moments",
];
type TextDraft = { milestone: number; id?: number; text: string };
type PlanDraft = {
  version: number;
  activity: string;
  local: string;
  instant: string;
};
export function PeonyPanel({
  flowerId,
  refreshKey,
  now,
  busy,
  mutate,
}: {
  flowerId: string;
  refreshKey: string;
  now: number;
  busy: boolean;
  mutate: Mutate;
}) {
  const [state, setState] = useState<PeonyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [stale, setStale] = useState(true);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [text, setText] = useState<TextDraft | null>(null);
  const [plan, setPlan] = useState<PlanDraft | null>(null);
  const mounted = useRef(false),
    lock = useRef(false),
    generation = useRef(0);
  const apply = useCallback((r: PeonyResult) => {
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
      const r = await readPeony(flowerId);
      if (token === generation.current) apply(r);
    } catch {
      if (token === generation.current)
        apply({
          state: null,
          error: "Peony could not refresh. Your draft is here; try again.",
        });
    }
  }, [flowerId, apply]);
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
  const candidates = plan ? pacificCandidates(plan.local) : [];
  const chosen =
    plan?.instant && pacificLocal(plan.instant) === plan.local
      ? plan.instant
      : candidates.length === 1
        ? candidates[0]
        : "";
  const validInstant =
    !!chosen &&
    candidates.some(
      (candidate) =>
        Math.floor(Date.parse(candidate) / 60000) ===
        Math.floor(Date.parse(chosen) / 60000),
    );
  const validText =
    text &&
    text.text.trim().length > 0 &&
    Array.from(text.text.trim()).length <= 4000 &&
    new TextEncoder().encode(JSON.stringify({ text: text.text.trim() }))
      .length <= 20000;
  const currentEdit = text?.id
    ? state?.contributions.find((c) => c.id === text.id)
    : null;
  const editableText =
    text &&
    state?.next_milestone === text.milestone &&
    (!text.id || (currentEdit && canEditContribution(currentEdit, now)));
  const planChanged = !!plan && plan.version !== (state?.plan?.version ?? 0);
  return (
    <section
      className={styles.stack}
      aria-label="Peony milestones"
      aria-busy={pending}
    >
      <p>
        Four steps, together. Each completed pair grows this Peony immediately.
        Take your time—Peony never loses progress.
      </p>
      {(error || readError) && (
        <p role="alert" className={styles.error}>
          {error || readError}
        </p>
      )}
      {stale && (
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => void refresh()}
        >
          Refresh milestones
        </button>
      )}
      {pending && <p role="status">Saving your shared step…</p>}
      {saved && (
        <p role="status">Your step is saved and visible to your partner.</p>
      )}
      {!state ? (
        <p>Loading your shared milestones…</p>
      ) : (
        <>
          <p role="status">
            {state.next_milestone
              ? `Next: ${titles[state.next_milestone - 1]}`
              : "All four milestones complete. A permanent bloom, with your memories below."}
          </p>
          {titles.map((title, index) => {
            const milestone = index + 1,
              complete = state.stage >= milestone,
              current = state.next_milestone === milestone;
            const rows = state.contributions.filter(
              (c) => c.milestone === milestone,
            );
            const own = rows.find((c) => c.author_id === state.member_id);
            const completion = state.completed_milestones.find(
              (c) => c.milestone === milestone,
            );
            return (
              <section
                className={styles.entry}
                key={milestone}
                aria-label={title}
              >
                <h3>
                  {milestone}. {title}
                </h3>
                <p>
                  {complete
                    ? "Complete · Read-only"
                    : current
                      ? "Your next shared step"
                      : "After the previous step"}
                </p>
                {completion && (
                  <p className={styles.quiet}>
                    Completed {pacificDate(completion.completed_at)} · Garden
                    day {completion.garden_day}
                  </p>
                )}
                {(current || complete) &&
                  (milestone !== 2 ? (
                    <>
                      {[state.member_id, state.member_id === 1 ? 2 : 1].map(
                        (member) => {
                          const c = rows.find((c) => c.author_id === member);
                          return (
                            <article key={member} className={styles.notice}>
                              <strong>
                                {member === state.member_id
                                  ? "You"
                                  : "Your partner"}
                              </strong>
                              {c ? (
                                <>
                                  <p className={styles.entryText}>
                                    {milestone === 3
                                      ? "Confirmed: our date happened."
                                      : c.payload.text}
                                  </p>
                                  <small>
                                    Shared {pacificDate(c.original_posted_at)}
                                  </small>
                                  {canEditContribution(c, now) && (
                                    <>
                                      <p className={styles.quiet}>
                                        Edit{" "}
                                        {c.edit_deadline_inclusive
                                          ? "until"
                                          : "before"}{" "}
                                        {pacificDate(c.edit_deadline)}. Original
                                        time stays the same.
                                      </p>
                                      <button
                                        className="button button-secondary"
                                        disabled={blocked}
                                        onClick={() => {
                                          setText({
                                            id: c.id,
                                            milestone,
                                            text: c.payload.text ?? "",
                                          });
                                          setSaved(false);
                                        }}
                                      >
                                        Edit your contribution
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                <p>
                                  {current
                                    ? "Not shared yet"
                                    : "Waiting for this step"}
                                </p>
                              )}
                            </article>
                          );
                        },
                      )}
                      {current &&
                        !own &&
                        !text &&
                        (milestone === 3 ? (
                          <button
                            className="button button-primary"
                            disabled={blocked}
                            onClick={() =>
                              void save({ kind: "submit", milestone: 3 })
                            }
                          >
                            Our date happened
                          </button>
                        ) : (
                          <button
                            className="button button-primary"
                            disabled={blocked}
                            onClick={() => {
                              setText({ milestone, text: "" });
                              setSaved(false);
                            }}
                          >
                            {milestone === 1
                              ? "Share your idea"
                              : "Share your favorite moment"}
                          </button>
                        ))}
                    </>
                  ) : (
                    <>
                      {state.plan ? (
                        <>
                          <p className={styles.entryText}>
                            {state.plan.activity}
                          </p>
                          <p>{pacificDate(state.plan.starts_at)}</p>
                          <p>Plan version {state.plan.version}</p>
                          {[state.member_id, state.member_id === 1 ? 2 : 1].map(
                            (member) => (
                              <p key={member}>
                                {member === state.member_id
                                  ? "You"
                                  : "Your partner"}{" "}
                                ·{" "}
                                {state.plan!.acceptances.some(
                                  (a) => a.author_id === member,
                                )
                                  ? `Accepted version ${state.plan!.version}`
                                  : "Not accepted yet"}
                              </p>
                            ),
                          )}
                          {current && state.plan.version > 1 && (
                            <p role="status">
                              The plan changed. Previous acceptances were
                              cleared; both people must accept this version.
                            </p>
                          )}
                          {current && state.plan.can_accept && !plan && (
                            <button
                              className="button button-primary"
                              disabled={blocked}
                              onClick={() =>
                                void save({
                                  kind: "accept",
                                  version: state.plan!.version,
                                })
                              }
                            >
                              Accept plan version {state.plan.version}
                            </button>
                          )}
                        </>
                      ) : (
                        <p>
                          Choose a shared activity and an exact Pacific date and
                          time. Remote and in-person dates both count.
                        </p>
                      )}
                      {current && !plan && (state.plan?.can_edit ?? true) && (
                        <button
                          className="button button-secondary"
                          disabled={blocked}
                          onClick={() => {
                            setPlan({
                              version: state.plan?.version ?? 0,
                              activity: state.plan?.activity ?? "",
                              local: state.plan
                                ? pacificLocal(state.plan.starts_at)
                                : "",
                              // Keep PostgreSQL microseconds; Date serialization loses them.
                              instant: state.plan?.starts_at ?? "",
                            });
                            setSaved(false);
                          }}
                        >
                          {state.plan
                            ? "Edit shared plan"
                            : "Create shared plan"}
                        </button>
                      )}
                    </>
                  ))}
              </section>
            );
          })}
          {text && (
            <form
              className={styles.stack}
              onSubmit={(e) => {
                e.preventDefault();
                if (validText && editableText)
                  void save(
                    text.id
                      ? { kind: "edit", id: text.id, text: text.text }
                      : {
                          kind: "submit",
                          milestone: text.milestone,
                          text: text.text,
                        },
                  );
              }}
            >
              <label className={styles.field}>
                {text.milestone === 1 ? "Your idea" : "Your favorite moment"}
                <textarea
                  disabled={pending}
                  aria-label={
                    text.milestone === 1 ? "Your idea" : "Your favorite moment"
                  }
                  rows={4}
                  value={text.text}
                  onChange={(e) => setText({ ...text, text: e.target.value })}
                />
                <small>
                  1–4,000 characters. Personal edits last up to 30 minutes,
                  before 4 a.m., and only until the pair is complete.
                </small>
              </label>
              {!editableText && (
                <p role="status">
                  This step or its edit window has ended. Your draft is kept
                  here to copy.
                </p>
              )}
              <button
                className="button button-primary"
                disabled={blocked || !validText || !editableText}
              >
                {pending ? "Saving…" : "Save contribution"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={pending}
                onClick={() => setText(null)}
              >
                Discard draft
              </button>
            </form>
          )}
          {plan && (
            <form
              className={styles.stack}
              onSubmit={(e) => {
                e.preventDefault();
                if (!planChanged && chosen && validInstant)
                  void save({
                    kind: "plan",
                    version: plan.version,
                    activity: plan.activity,
                    startsAt: chosen,
                  });
              }}
            >
              <label className={styles.field}>
                Shared activity
                <textarea
                  disabled={pending}
                  aria-label="Shared activity"
                  value={plan.activity}
                  rows={3}
                  onChange={(e) =>
                    setPlan({ ...plan, activity: e.target.value })
                  }
                />
                <small>
                  1–2,000 characters. A material change clears both acceptances.
                </small>
              </label>
              <label className={styles.field}>
                Date and time in Pacific
                <input
                  type="datetime-local"
                  disabled={pending}
                  value={plan.local}
                  onChange={(e) =>
                    setPlan({ ...plan, local: e.target.value, instant: "" })
                  }
                />
              </label>
              {plan.local && candidates.length === 0 && (
                <p role="alert">
                  This Pacific time does not exist or is invalid. Choose another
                  time.
                </p>
              )}
              {candidates.length === 2 && (
                <label className={styles.field}>
                  This time occurs twice. Choose which one
                  <select
                    disabled={pending}
                    value={plan.instant}
                    onChange={(e) =>
                      setPlan({ ...plan, instant: e.target.value })
                    }
                  >
                    <option value="">Choose an occurrence</option>
                    {candidates.map((instant) => (
                      <option key={instant} value={instant}>
                        {pacificDate(instant)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {chosen && validInstant && (
                <p>Agreed time: {pacificDate(chosen)}</p>
              )}
              {planChanged && (
                <>
                  <p role="status">
                    The shared plan changed while you were writing. Your draft
                    is preserved. Compare it with the current plan above before
                    continuing.
                  </p>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={blocked || state.next_milestone !== 2}
                    onClick={() =>
                      setPlan({ ...plan, version: state.plan?.version ?? 0 })
                    }
                  >
                    I reviewed the current plan; keep my draft
                  </button>
                </>
              )}
              {state.next_milestone !== 2 && (
                <p role="status">
                  The shared plan is complete and read-only. Your draft is kept
                  here to copy.
                </p>
              )}
              <button
                className="button button-primary"
                disabled={
                  blocked ||
                  state.next_milestone !== 2 ||
                  planChanged ||
                  !chosen ||
                  !validInstant ||
                  !plan.activity.trim() ||
                  Array.from(plan.activity.trim()).length > 2000 ||
                  new TextEncoder().encode(plan.activity.trim()).length > 8000
                }
              >
                {pending ? "Saving…" : "Save shared plan"}
              </button>
              <button
                className="button button-secondary"
                type="button"
                disabled={pending}
                onClick={() => setPlan(null)}
              >
                Discard plan draft
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
