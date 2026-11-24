"use client";
import {
  canEditAt,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import { useVoiceDraft } from "@/lib/media/use-voice-draft";
import { voiceTime } from "@/lib/media/use-voice-recorder";
import type { Mutate } from "@/components/garden/seed-picker";
import { VoicePlayer } from "./voice-player";
import styles from "./voice.module.css";

export function VoiceForm({
  plant,
  state,
  now,
  busy,
  mutate,
  editing,
  onSaved,
  onCancel,
}: {
  plant: Plant;
  state: GardenState;
  now: number;
  busy: boolean;
  mutate: Mutate;
  editing?: Entry | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const expired = !!editing && !canEditAt(editing, state, now);
  const draft = useVoiceDraft({
    flowerId: plant.flower.id,
    gardenDay: state.garden_day,
    nextRolloverAt: state.next_rollover_at,
    now,
    busy,
    mutate,
    editingId: editing?.id,
    expired,
    onSaved,
  });
  const { recorder, active, ready, pending, rejected, error } = draft;
  const { boundary, newDay, start, discard, submit } = draft;
  const { recordButton, stopButton, resumeButton, reviewHeading } = draft.refs;
  // Nest under the replacement heading when present, else under the sheet title.
  const ReviewHeading = editing ? "h4" : "h3";
  return (
    <form
      className={styles.stack}
      aria-label={
        editing ? "Replace your voice memo" : "Share a Bluebell voice memo"
      }
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
    >
      {editing && <h3>Replace your voice memo</h3>}
      <p className={styles.hint}>
        Up to five minutes · WebM/Opus up to 12 MiB. The microphone turns on
        only after you choose Record. Review before sharing; listening never
        changes growth.
      </p>
      <p className={styles.hint} role="status">
        {recorder.phase === "requesting"
          ? "Waiting for microphone permission…"
          : recorder.phase === "recording"
            ? "Recording. Automatically stops at five minutes."
            : recorder.phase === "paused"
              ? "Recording paused. Paused time does not count."
              : recorder.phase === "stopping"
                ? "Finishing recording…"
                : recorder.phase === "review"
                  ? "Recording stopped. Your memo has not been shared yet."
                  : "Microphone is off."}
      </p>
      {(active || recorder.phase === "review") && (
        <p
          className={styles.clock}
          aria-label={`Recorded time ${voiceTime(recorder.elapsedMs)}`}
        >
          {voiceTime(recorder.elapsedMs)} / 5:00
        </p>
      )}
      <div className={styles.controls}>
        {!active && recorder.phase !== "requesting" && (
          <button
            ref={recordButton}
            type="button"
            className="button button-secondary"
            disabled={pending || busy || expired || boundary}
            onClick={start}
          >
            {recorder.phase === "review" ? "Re-record memo" : "Record"}
          </button>
        )}
        {recorder.phase === "recording" && recorder.canPause && (
          <button
            type="button"
            className="button button-secondary"
            onClick={recorder.pause}
          >
            Pause recording
          </button>
        )}
        {recorder.phase === "paused" && (
          <button
            ref={resumeButton}
            type="button"
            className="button button-secondary"
            onClick={recorder.resume}
          >
            Resume recording
          </button>
        )}
        {(recorder.phase === "recording" || recorder.phase === "paused") && (
          <button
            ref={stopButton}
            type="button"
            className="button button-primary"
            onClick={recorder.stop}
          >
            Stop and review
          </button>
        )}
        {recorder.phase !== "idle" && (
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={discard}
          >
            {recorder.phase === "requesting"
              ? "Cancel microphone request"
              : "Discard recording"}
          </button>
        )}
      </div>
      {recorder.file && recorder.preview && (
        <>
          <ReviewHeading
            ref={reviewHeading}
            className={styles.review}
            tabIndex={-1}
          >
            Review your voice memo
          </ReviewHeading>
          <VoicePlayer
            key={recorder.preview}
            source={recorder.preview}
            label="Your voice memo preview"
            onReady={draft.markReady}
            onError={draft.previewFailed}
          />
          {recorder.elapsedMs > 300000 && (
            <p role="status">
              Your browser delayed stopping. The server checks the complete
              recording and may reject it if it exceeds five minutes. It will
              not shorten your memo.
            </p>
          )}
        </>
      )}
      {boundary && (
        <p role="status">
          Waiting for the current garden day. Your recording stays here for
          review.
        </p>
      )}
      {newDay && recorder.file && !editing && !boundary && (
        <div role="status">
          <p>
            A new garden day has begun. Review this memo before sharing today.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={draft.keepForToday}
          >
            Use this memo today
          </button>
        </div>
      )}
      {expired && (
        <p role="status">
          The original edit window has ended. Your saved memo is unchanged.
        </p>
      )}
      {(error || recorder.error) && (
        <p className={styles.error} role="alert">
          {error ?? recorder.error}
        </p>
      )}
      <button
        className="button button-primary"
        disabled={
          !recorder.file ||
          !ready ||
          ready !== recorder.preview ||
          !!rejected ||
          pending ||
          busy ||
          expired ||
          boundary ||
          newDay
        }
      >
        {pending
          ? "Uploading and checking…"
          : editing
            ? "Save replacement memo"
            : "Share voice memo"}
      </button>
      {editing && (
        <button
          type="button"
          className="button button-secondary"
          disabled={pending}
          onClick={onCancel}
        >
          Cancel replacement
        </button>
      )}
    </form>
  );
}
