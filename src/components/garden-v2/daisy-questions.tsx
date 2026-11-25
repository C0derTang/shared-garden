"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { characters, textValid } from "@/lib/garden/entry-draft";
import { DAISY_QUESTION_LIMIT, daisyAskedBy, daisyQuestionFor, type EntryQuestion, type GardenState, type Plant } from "@/lib/garden-v2/model";
import type { MutateV2 } from "./care-form";
import styles from "./garden-v2.module.css";

/**
 * The Daisy's questions (#212, decision 0068): the one you answer today (your
 * partner's own question, else the shared daily one) and your own question for
 * your partner, which you can write, edit or remove until they answer it.
 */
export function DaisyQuestions({ plant, state, now, busy, mutate }: { plant: Plant; state: GardenState; now: number; busy: boolean; mutate: MutateV2 }) {
  const partner = usePartnerName();
  if (plant.flower.type_key !== "daisy") return null;
  const yours = daisyQuestionFor(plant, state.member_id);
  if (!yours) return null;
  return (
    <>
      <section className={styles.callout} aria-label="Question of the day">
        <p className={styles.calloutLabel}>{yours.kind === "custom" ? `${partner.short} asks` : `today’s ${yours.category === "light" ? "light" : "deeper"} question`}</p>
        <p className={styles.question}>{yours.prompt}</p>
      </section>
      {plant.flower.first_bloom_at === null && <AskPartner plant={plant} state={state} now={now} busy={busy} mutate={mutate} />}
    </>
  );
}

function AskPartner({ plant, state, now, busy, mutate }: { plant: Plant; state: GardenState; now: number; busy: boolean; mutate: MutateV2 }) {
  const partner = usePartnerName();
  const id = useId();
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const asked = daisyAskedBy(plant, state.member_id);
  const partnerAnswered = state.member_id === 1 ? plant.member2_submitted : plant.member1_submitted;
  const locked = !!asked && (asked.locked || partnerAnswered);
  const rollover = now >= Date.parse(state.next_rollover_at);

  // Once your partner has answered the daily question, there is nothing left to ask today.
  if (!asked && partnerAnswered) return null;

  async function run(command: Parameters<MutateV2>[0]) {
    if (lock.current || busy) return false;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await mutate(command);
      setError(result.error);
      return result.saved === true;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!textValid(draft, DAISY_QUESTION_LIMIT) || rollover) return;
    if (await run({ kind: "askDaisy", flowerId: plant.flower.id, prompt: draft })) {
      setWriting(false);
      setDraft("");
    }
  }

  const title = `Your question for ${partner.short}`;
  return (
    <section className={styles.ask} aria-label={title}>
      {writing && !locked ? (
        <form className={styles.form} onSubmit={(event) => void save(event)} aria-label={asked ? "Edit your question" : "Ask your own question"} aria-busy={pending}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>your question for {partner.short}</span>
              <textarea
                rows={2}
                required
                placeholder="something you’d love to know…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-describedby={`${id}-count`}
              />
            </label>
            <small id={`${id}-count`}>
              {characters(draft)} / {DAISY_QUESTION_LIMIT} · {partner.subject} answers it instead of today’s question.
            </small>
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.primary} disabled={!textValid(draft, DAISY_QUESTION_LIMIT) || busy || pending || rollover}>
              {pending ? "saving…" : asked ? "save question" : "ask"}
            </button>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => {
                setWriting(false);
                setError(null);
              }}
            >
              cancel
            </button>
          </div>
        </form>
      ) : asked ? (
        <>
          <p className={styles.calloutLabel}>you asked {partner.short}</p>
          <p className={styles.askPrompt}>{asked.prompt}</p>
          {locked ? (
            <p className={styles.quiet} role="status">
              {partner.short} answered · it stays as asked
            </p>
          ) : (
            <>
              <p className={styles.editRow}>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy || pending}
                  onClick={() => {
                    setDraft(asked.prompt);
                    setError(null);
                    setWriting(true);
                  }}
                >
                  edit
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  disabled={busy || pending}
                  onClick={() => void run({ kind: "removeDaisyQuestion", flowerId: plant.flower.id })}
                >
                  {pending ? "removing…" : "remove"}
                </button>
              </p>
              <p className={styles.quiet}>You can change it until {partner.short} answers.</p>
            </>
          )}
        </>
      ) : (
        <button
          type="button"
          className={styles.textButton}
          disabled={busy}
          onClick={() => {
            setDraft("");
            setError(null);
            setWriting(true);
          }}
        >
          ask {partner.short} your own question
        </button>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** The question a Daisy answer responded to, with who asked it. */
export function AnsweredQuestion({ question, memberId }: { question: EntryQuestion; memberId: 1 | 2 }) {
  const partner = usePartnerName();
  const label =
    question.kind === "custom"
      ? question.asked_by === memberId
        ? "you asked"
        : `${partner.short} asked`
      : `the ${question.category === "light" ? "light" : "deeper"} question`;
  return (
    <div className={styles.answered}>
      <p className={styles.answeredLabel}>{label}</p>
      <p className={styles.answeredPrompt}>{question.prompt}</p>
    </div>
  );
}
