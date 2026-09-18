"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  canEditAt,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import {
  MediaError,
  mediaRequest,
  saveVoice,
  voiceSaveMessage,
  type MediaAttempt,
} from "@/lib/media/browser";
import {
  stopVoicePlayback,
  useVoiceRecorder,
  voiceTime,
} from "@/lib/media/use-voice-recorder";
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
  const recorder = useVoiceRecorder();
  const [day, setDay] = useState(state.garden_day);
  const [ready, setReady] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState<"bytes" | "window" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ file: File; value: MediaAttempt } | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const recordButton = useRef<HTMLButtonElement>(null);
  const stopButton = useRef<HTMLButtonElement>(null);
  const resumeButton = useRef<HTMLButtonElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef(recorder.phase);
  const expired = !!editing && !canEditAt(editing, state, now);
  const boundary = now >= Date.parse(state.next_rollover_at);
  const newDay = day !== state.garden_day;
  const active = ["recording", "paused", "stopping"].includes(recorder.phase);
  useEffect(() => {
    alive.current = true;
    void mediaRequest("cleanup", {}).catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (recorder.phase === "recording") stopButton.current?.focus();
    if (recorder.phase === "paused") resumeButton.current?.focus();
    if (recorder.phase === "review") reviewHeading.current?.focus();
    if (
      recorder.phase === "idle" &&
      (previousPhase.current !== "idle" || recorder.error)
    )
      recordButton.current?.focus();
    previousPhase.current = recorder.phase;
  }, [recorder.phase, recorder.error]);
  function start() {
    if (pending || busy || expired || boundary) return;
    setDay(state.garden_day);
    setReady(null);
    setRejected(null);
    setError(null);
    attempt.current = null;
    void recorder.start();
  }
  function discard() {
    recorder.discard();
    setReady(null);
    setError(null);
    setRejected(null);
    attempt.current = null;
    recordButton.current?.focus();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const file = recorder.file;
    if (
      !file ||
      !ready ||
      ready !== recorder.preview ||
      rejected ||
      pending ||
      busy ||
      lock.current ||
      expired ||
      boundary ||
      newDay
    )
      return;
    if (attempt.current?.file !== file)
      attempt.current = { file, value: { requestId: crypto.randomUUID() } };
    const identity = attempt.current.value;
    lock.current = true;
    setPending(true);
    setError(null);
    stopVoicePlayback();
    let detail: string | null = null;
    try {
      const result = await mutate({
        kind: "external",
        run: async (checkCurrent) => {
          try {
            await saveVoice(
              file,
              plant.flower.id,
              editing?.id,
              identity,
              () => {
                if (!alive.current)
                  throw new Error(
                    "Voice sheet closed. Check entries before retrying.",
                  );
                checkCurrent();
              },
            );
          } catch (cause) {
            if (alive.current && cause instanceof MediaError) {
              if (
                [
                  "unsupported_audio",
                  "invalid_audio",
                  "audio_too_large",
                  "type_mismatch",
                  "photo_size_mismatch",
                ].includes(cause.code)
              )
                setRejected("bytes");
              else if (
                cause.code === "entry_rejected" ||
                cause.code.startsWith("media_expired")
              )
                setRejected("window");
            }
            detail = voiceSaveMessage(cause);
            throw cause;
          }
        },
      });
      if (!alive.current) return;
      if (result.saved) {
        recorder.discard();
        attempt.current = null;
        setReady(null);
        void mediaRequest("cleanup", {}).catch(() => {});
        onSaved();
      } else setError(detail ?? result.error);
    } finally {
      lock.current = false;
      if (alive.current) setPending(false);
    }
  }
  return (
    <form
      className={styles.stack}
      aria-label={
        editing ? "Replace your voice memo" : "Share a Bluebell voice memo"
      }
      aria-busy={pending}
      onSubmit={(event) => void submit(event)}
    >
      <h3>{editing ? "Replace your voice memo" : "A voice from your day"}</h3>
      <p>
        Record up to five minutes. Review before sharing. Your partner can
        listen immediately; listening never changes growth.
      </p>
      <p>
        Recording starts only when you choose Record and allow microphone
        access. WebM/Opus · up to 12 MiB.
      </p>
      <p role="status">
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
          <h4 ref={reviewHeading} tabIndex={-1}>
            Review your voice memo
          </h4>
          <VoicePlayer
            key={recorder.preview}
            source={recorder.preview}
            label="Your voice memo preview"
            onReady={() => setReady(recorder.preview)}
            onError={() => {
              setReady(null);
              setError(
                "This recording cannot be played. Record a new memo in a supported browser.",
              );
            }}
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
            onClick={() => {
              setDay(state.garden_day);
              if (rejected === "window") setRejected(null);
              attempt.current = null;
            }}
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
