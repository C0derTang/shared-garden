"use client";
import { useId } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { mutatePeonyV2, readPeonyV2 } from "@/lib/garden-v2/peony-actions";
import { canEditContribution, pacificDate, pacificLocal, type Contribution, type PeonyState } from "@/lib/peony/model";
import { peonyActivityValid, PEONY_TITLES, usePeonyMilestones, type PeonyActions } from "@/lib/peony/use-peony-milestones";
import type { MutateV2 } from "./care-form";
import { gardenDate, gardenTime } from "./entry-view";
import styles from "./garden-v2.module.css";

const v2Peony: PeonyActions = { read: readPeonyV2, mutate: mutatePeonyV2 };

/** What each milestone asks of you both, in the garden's voice. */
const ABOUT = [
  "Each of you shares an idea for something to do together.",
  "One of you writes the plan and its exact time; you both accept the same version.",
  "Once it has happened, you each confirm it.",
  "Each of you keeps a favorite moment from it.",
];

/**
 * A plan's agreed instant as decision 0015 shows it: full date, seconds and the
 * Pacific zone, so a repeated autumn hour reads as PDT or PST.
 */
const planTime = (instant: string) => pacificDate(instant);
const shared = (instant: string) => `${gardenDate(instant)}, ${gardenTime(instant)}`;

/**
 * The Peony's four shared milestones, in order: ideas, an agreed plan, the
 * date itself and favorite moments. Each one both of you finish grows the
 * Peony at once; nothing is ever lost.
 */
export function PeonyMilestones({ flowerId, refreshKey, now, busy, mutate }: { flowerId: string; refreshKey: string; now: number; busy: boolean; mutate: MutateV2 }) {
  const partner = usePartnerName();
  const id = useId();
  const peony = usePeonyMilestones({ flowerId, refreshKey, now, busy, mutate, actions: v2Peony });
  const { state, text, plan, blocked, pending } = peony;

  const who = (member: number) => (state && member === state.member_id ? "you" : partner.short);

  function contribution(milestone: number, member: 1 | 2, current: boolean, row: Contribution | undefined) {
    const mine = state!.member_id === member;
    return (
      <li key={member} className={styles.contribution} data-who={mine ? "you" : "partner"}>
        <p className={styles.contributionWho}>{who(member)}</p>
        {row ? (
          <>
            <p className={milestone === 3 ? styles.cue : styles.entryText}>{milestone === 3 ? "our date happened ✿" : row.payload.text}</p>
            <p className={styles.meta}>
              <time dateTime={row.original_posted_at}>{shared(row.original_posted_at)}</time>
            </p>
            {mine && canEditContribution(row, now) && milestone !== 3 && text?.id !== row.id && (
              <p className={styles.editRow}>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={blocked}
                  onClick={() => {
                    peony.setText({ id: row.id, milestone, text: row.payload.text ?? "" });
                    peony.setSaved(false);
                  }}
                >
                  edit
                </button>
                <small>
                  {row.edit_deadline_inclusive ? "until" : "before"} {gardenTime(row.edit_deadline)}, while the step is open · the original time stays
                </small>
              </p>
            )}
          </>
        ) : (
          <p className={styles.quiet}>{current ? "not yet" : "—"}</p>
        )}
      </li>
    );
  }

  function textForm(milestone: number) {
    if (!text || text.milestone !== milestone) return null;
    const label = milestone === 1 ? "your idea" : "your favorite moment";
    return (
      <form
        className={styles.form}
        aria-label={text.id ? `Edit ${label}` : `Share ${label}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (peony.validText && peony.editableText)
            void peony.save(text.id ? { kind: "edit", id: text.id, text: text.text } : { kind: "submit", milestone, text: text.text });
        }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            <span>{label}</span>
            <textarea
              rows={4}
              disabled={pending}
              placeholder={milestone === 1 ? "something we could do together…" : "the moment you keep coming back to…"}
              value={text.text}
              onChange={(event) => peony.setText({ ...text, text: event.target.value })}
              aria-describedby={`${id}-text-${milestone}`}
            />
          </label>
          <small id={`${id}-text-${milestone}`}>
            {Array.from(text.text.trim()).length.toLocaleString("en-US")} / 4,000 · edits last 30 minutes, until 4 a.m., while the step is open.
          </small>
        </div>
        {!peony.editableText && (
          <p className={styles.note} role="status">
            This step or its edit window has ended. Your draft stays here to copy.
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={blocked || !peony.validText || !peony.editableText}>
            {pending ? "saving…" : text.id ? "save edit" : "share"}
          </button>
          <button type="button" className={styles.textButton} disabled={pending} onClick={() => peony.setText(null)}>
            {text.id ? "cancel" : "not now"}
          </button>
        </div>
      </form>
    );
  }

  function planForm(state: PeonyState) {
    if (!plan) return null;
    const { candidates, chosen, validInstant, planChanged } = peony;
    return (
      <form
        className={styles.form}
        aria-label={state.plan ? "Change the shared plan" : "Make the shared plan"}
        onSubmit={(event) => {
          event.preventDefault();
          if (!planChanged && chosen && validInstant)
            void peony.save({ kind: "plan", version: plan.version, activity: plan.activity, startsAt: chosen });
        }}
      >
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            <span>what we’ll do</span>
            <textarea
              rows={3}
              disabled={pending}
              placeholder="a picnic by the water, a call and a film…"
              value={plan.activity}
              onChange={(event) => peony.setPlan({ ...plan, activity: event.target.value })}
              aria-describedby={`${id}-activity`}
            />
          </label>
          <small id={`${id}-activity`}>Up to 2,000 characters. Together or apart, both count. Changing it asks you both to accept again.</small>
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            <span>when (Pacific time)</span>
            <input
              type="datetime-local"
              disabled={pending}
              value={plan.local}
              onChange={(event) => peony.setPlan({ ...plan, local: event.target.value, instant: "" })}
            />
          </label>
        </div>
        {plan.local && candidates.length === 0 && (
          <p className={styles.error} role="alert">
            That Pacific time doesn’t exist or isn’t valid. Choose another time.
          </p>
        )}
        {candidates.length === 2 && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>this hour happens twice · which one?</span>
              <select disabled={pending} value={plan.instant} onChange={(event) => peony.setPlan({ ...plan, instant: event.target.value })}>
                <option value="">choose one</option>
                {candidates.map((instant) => (
                  <option key={instant} value={instant}>
                    {pacificDate(instant)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {chosen && validInstant && <p className={styles.formHint}>Agreed time: {planTime(chosen)}</p>}
        {planChanged && (
          <div className={styles.note} role="status">
            <p>The plan changed while you were writing. Your draft is kept; compare it with the plan above first.</p>
            <button
              type="button"
              className={styles.textButton}
              disabled={blocked || state.next_milestone !== 2}
              onClick={() => peony.setPlan({ ...plan, version: state.plan?.version ?? 0 })}
            >
              I’ve read it · keep my draft
            </button>
          </div>
        )}
        {state.next_milestone !== 2 && (
          <p className={styles.note} role="status">
            The plan is settled and read-only now. Your draft stays here to copy.
          </p>
        )}
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primary}
            disabled={blocked || state.next_milestone !== 2 || planChanged || !chosen || !validInstant || !peonyActivityValid(plan.activity)}
          >
            {pending ? "saving…" : "save the plan"}
          </button>
          <button type="button" className={styles.textButton} disabled={pending} onClick={() => peony.setPlan(null)}>
            {state.plan ? "cancel" : "not now"}
          </button>
        </div>
      </form>
    );
  }

  function planStep(state: PeonyState, current: boolean) {
    const p = state.plan;
    const partnerId = state.member_id === 1 ? 2 : 1;
    return (
      <>
        {p ? (
          <div className={styles.planCard}>
            <p className={styles.entryText}>{p.activity}</p>
            <p className={styles.planWhen}>
              <time dateTime={p.starts_at}>{planTime(p.starts_at)}</time>
            </p>
            <ul className={styles.planAccepts} aria-label="Who has accepted this plan">
              {[state.member_id, partnerId].map((member) => {
                const accepted = p.acceptances.some((a) => a.author_id === member);
                return (
                  <li key={member} data-who={member === state.member_id ? "you" : "partner"} data-accepted={accepted || undefined}>
                    <span aria-hidden="true">{accepted ? "✿" : "·"}</span> {who(member)} {accepted ? `accepted version ${p.version}` : "· not yet"}
                  </li>
                );
              })}
            </ul>
            <p className={styles.quiet}>
              Plan version {p.version}.{p.version > 1 && " It changed, so earlier acceptances were cleared and you both accept this version."}
            </p>
          </div>
        ) : current ? (
          <p className={styles.quiet}>No plan yet. Write what you’ll do and exactly when, in Pacific time.</p>
        ) : null}
        {current && !plan && (
          <div className={styles.actions}>
            {p?.can_accept && (
              <button type="button" className={styles.primary} disabled={blocked} onClick={() => void peony.save({ kind: "accept", version: p.version })}>
                accept plan version {p.version}
              </button>
            )}
            {(p?.can_edit ?? true) && (
              <button
                type="button"
                className={p?.can_accept ? styles.textButton : styles.secondary}
                disabled={blocked}
                onClick={() => {
                  peony.setPlan({
                    version: p?.version ?? 0,
                    activity: p?.activity ?? "",
                    local: p ? pacificLocal(p.starts_at) : "",
                    // Keep PostgreSQL microseconds; Date serialization loses them.
                    instant: p?.starts_at ?? "",
                  });
                  peony.setSaved(false);
                }}
              >
                {p ? "change the plan" : "make a plan"}
              </button>
            )}
          </div>
        )}
        {/* A draft stays open (copyable, unsavable) even after the plan is settled under it. */}
        {(current || plan) && planForm(state)}
      </>
    );
  }

  return (
    <section className={styles.peony} aria-label="Peony milestones" aria-busy={pending}>
      <p className={styles.quiet}>Four shared steps, in order. Each one you finish together grows the peony right away. Take your time; it never loses progress.</p>
      {(peony.error || peony.readError) && (
        <p className={styles.error} role="alert">
          {peony.error || peony.readError}
        </p>
      )}
      {peony.stale && state && (
        <button type="button" className={styles.secondary} disabled={pending} onClick={() => void peony.refresh()}>
          refresh the milestones
        </button>
      )}
      {!state ? (
        peony.stale && peony.readError ? (
          <button type="button" className={styles.secondary} disabled={pending} onClick={() => void peony.refresh()}>
            try again
          </button>
        ) : (
          <p className={styles.quiet} role="status">
            reading your milestones…
          </p>
        )
      ) : (
        <>
          <p className={styles.srOnly} role="status">
            {pending
              ? "Saving your shared step…"
              : peony.saved
                ? `Saved. ${partner.subject} can see it now.`
                : state.next_milestone
                  ? `Next: ${PEONY_TITLES[state.next_milestone - 1]}`
                  : "All four milestones complete."}
          </p>
          <ol className={styles.steps}>
            {PEONY_TITLES.map((title, index) => {
              const milestone = index + 1;
              const complete = state.stage >= milestone;
              const current = state.next_milestone === milestone;
              const rows = state.contributions.filter((c) => c.milestone === milestone);
              const own = rows.find((c) => c.author_id === state.member_id);
              const completion = state.completed_milestones.find((c) => c.milestone === milestone);
              const status = complete ? "done together" : current ? "now" : "after the step before";
              return (
                <li key={milestone} className={styles.step} data-state={complete ? "complete" : current ? "current" : "later"} aria-current={current ? "step" : undefined}>
                  <span className={styles.stepMark} aria-hidden="true">
                    {complete ? "✿" : milestone}
                  </span>
                  <div className={styles.stepBody}>
                    <h3 className={styles.stepTitle}>
                      <span className={styles.srOnly}>Step {milestone}: </span>
                      {title.toLowerCase()}
                      <span className={styles.stepStatus}> · {status}</span>
                    </h3>
                    {completion && (
                      <p className={styles.meta}>
                        finished <time dateTime={completion.completed_at}>{shared(completion.completed_at)}</time>
                      </p>
                    )}
                    {current && <p className={styles.quiet}>{ABOUT[index]}</p>}
                    {(current || complete) &&
                      (milestone === 2 ? (
                        planStep(state, current)
                      ) : (
                        <>
                          <ul className={styles.contributions}>
                            {([state.member_id, state.member_id === 1 ? 2 : 1] as const).map((member) =>
                              contribution(
                                milestone,
                                member,
                                current,
                                rows.find((c) => c.author_id === member),
                              ),
                            )}
                          </ul>
                          {current && !own && !text && (
                            <div className={styles.actions}>
                              {milestone === 3 ? (
                                <button type="button" className={styles.primary} disabled={blocked} onClick={() => void peony.save({ kind: "submit", milestone: 3 })}>
                                  our date happened
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className={styles.primary}
                                  disabled={blocked}
                                  onClick={() => {
                                    peony.setText({ milestone, text: "" });
                                    peony.setSaved(false);
                                  }}
                                >
                                  {milestone === 1 ? "share an idea" : "share a favorite moment"}
                                </button>
                              )}
                            </div>
                          )}
                          {textForm(milestone)}
                        </>
                      ))}
                  </div>
                </li>
              );
            })}
          </ol>
          {peony.saved && (
            <p className={styles.saved} aria-hidden="true">
              Saved. {partner.subject} can see it now.
            </p>
          )}
          {!state.next_milestone && <p className={styles.cue}>All four milestones done together. It blooms for good, with these memories.</p>}
        </>
      )}
    </section>
  );
}
