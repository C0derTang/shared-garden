"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MediaError,
  mediaRequest,
  saveVoice,
  voiceRejection,
  voiceSaveMessage,
  type MediaAttempt,
  type MediaStage,
} from "./browser";
import { mediaGardenField, type MediaGarden } from "./garden";
import type { MediaMutate } from "./use-photo-draft";
import { stopVoicePlayback, useVoiceRecorder } from "./use-voice-recorder";

export type VoiceDraftOptions = {
  flowerId: string;
  gardenDay: string;
  nextRolloverAt: string;
  now: number;
  busy: boolean;
  mutate: MediaMutate;
  editingId?: number;
  expired: boolean;
  onSaved: () => void;
  garden?: MediaGarden;
};

/**
 * A Bluebell voice memo from Record to confirmed save, shared by the legacy
 * and new gardens: the microphone turns on only after Record, a playable
 * review is required, one request identity per recording survives ambiguous
 * retries, and keyboard focus follows the recorder. The view decides how it
 * looks; it attaches the returned refs to its controls.
 */
export function useVoiceDraft({
  flowerId,
  gardenDay,
  nextRolloverAt,
  now,
  busy,
  mutate,
  editingId,
  expired,
  onSaved,
  garden = "legacy",
}: VoiceDraftOptions) {
  const recorder = useVoiceRecorder();
  const [day, setDay] = useState(gardenDay);
  const [ready, setReady] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<MediaStage | null>(null);
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
  const boundary = now >= Date.parse(nextRolloverAt);
  const newDay = day !== gardenDay;
  const active = ["recording", "paused", "stopping"].includes(recorder.phase);
  useEffect(() => {
    alive.current = true;
    void mediaRequest("cleanup", mediaGardenField(garden)).catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [garden]);
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
    setDay(gardenDay);
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
  function keepForToday() {
    setDay(gardenDay);
    if (rejected === "window") setRejected(null);
    attempt.current = null;
  }
  function previewFailed() {
    setReady(null);
    setError(
      "This recording cannot be played. Record a new memo in a supported browser.",
    );
  }
  const canSubmit =
    !!recorder.file &&
    !!ready &&
    ready === recorder.preview &&
    !rejected &&
    !pending &&
    !busy &&
    !expired &&
    !boundary &&
    !newDay;
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
              flowerId,
              editingId,
              identity,
              () => {
                if (!alive.current)
                  throw new Error(
                    "Voice sheet closed. Check entries before retrying.",
                  );
                checkCurrent();
              },
              garden,
              (next) => {
                if (alive.current) setStage(next);
              },
            );
          } catch (cause) {
            if (alive.current && cause instanceof MediaError) {
              const reason = voiceRejection(cause.code);
              if (reason) setRejected(reason);
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
        void mediaRequest("cleanup", mediaGardenField(garden)).catch(() => {});
        onSaved();
      } else setError(detail ?? result.error);
    } finally {
      lock.current = false;
      if (alive.current) {
        setPending(false);
        setStage(null);
      }
    }
  }
  return {
    recorder,
    active,
    ready,
    markReady: () => setReady(recorder.preview),
    previewFailed,
    pending,
    stage,
    rejected,
    error,
    boundary,
    newDay,
    canSubmit,
    start,
    discard,
    keepForToday,
    submit,
    refs: { recordButton, stopButton, resumeButton, reviewHeading },
  };
}
