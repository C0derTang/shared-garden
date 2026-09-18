"use client";
import { useEffect, useRef, useState } from "react";

export const voiceLimitMs = 300_000;
const recordingType = "audio/webm;codecs=opus";
type Phase =
  | "idle"
  | "requesting"
  | "recording"
  | "paused"
  | "stopping"
  | "review";
type Capture = {
  recorder: MediaRecorder | null;
  stream: MediaStream | null;
  interval?: ReturnType<typeof setInterval>;
  deadline?: ReturnType<typeof setTimeout>;
  elapsed: number;
  started: number | null;
};
type View = {
  phase: Phase;
  elapsedMs: number;
  file: File | null;
  preview: string | null;
  error: string | null;
  canPause: boolean;
};
const empty: View = {
  phase: "idle",
  elapsedMs: 0,
  file: null,
  preview: null,
  error: null,
  canPause: false,
};

export function stopVoicePlayback(except?: HTMLAudioElement) {
  document
    .querySelectorAll<HTMLAudioElement>("audio[data-garden-voice]")
    .forEach((audio) => {
      if (audio !== except) audio.pause();
    });
}
export function voiceTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
function clearTimers(capture: Capture) {
  clearInterval(capture.interval);
  clearTimeout(capture.deadline);
}
function releaseTracks(capture: Capture) {
  capture.stream?.getTracks().forEach((track) => track.stop());
  capture.stream = null;
}
function dispose(capture: Capture | null) {
  if (!capture) return;
  clearTimers(capture);
  if (capture.recorder) {
    capture.recorder.ondataavailable = null;
    capture.recorder.onstop = null;
    capture.recorder.onerror = null;
    try {
      if (capture.recorder.state !== "inactive") capture.recorder.stop();
    } catch {
      /* release below */
    }
  }
  releaseTracks(capture);
}
function captureError(error: unknown) {
  if (error instanceof Error && error.message === "Recording byte limit")
    return "This recording exceeded 12 MiB. Record a new memo in a supported browser.";
  if (
    error instanceof DOMException &&
    ["NotAllowedError", "SecurityError"].includes(error.name)
  )
    return "Microphone permission was not granted. Allow microphone access in your browser, then choose Record again.";
  if (
    error instanceof DOMException &&
    [
      "NotFoundError",
      "NotReadableError",
      "AbortError",
      "OverconstrainedError",
    ].includes(error.name)
  )
    return "The microphone is unavailable or in use. Check your device, then choose Record again.";
  return "This browser could not record a voice memo. Try an updated browser with WebM/Opus recording support. Your saved memo is unchanged.";
}

export function useVoiceRecorder() {
  const [view, setView] = useState<View>(empty);
  const current = useRef<Capture | null>(null);
  const generation = useRef(0);
  const requesting = useRef(false);
  const alive = useRef(true);
  const preview = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    // This is an operation counter, not a DOM ref: invalidate its latest value.
    const counter = generation;
    return () => {
      alive.current = false;
      counter.current++;
      dispose(current.current);
      current.current = null;
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = null;
    };
  }, []);
  function discard() {
    generation.current++;
    requesting.current = false;
    dispose(current.current);
    current.current = null;
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = null;
    setView(empty);
  }
  function elapsed(capture: Capture) {
    return (
      capture.elapsed +
      (capture.started === null ? 0 : performance.now() - capture.started)
    );
  }
  function fail(capture: Capture, error: unknown) {
    if (current.current !== capture) return;
    dispose(capture);
    current.current = null;
    setView({ ...empty, error: captureError(error) });
  }
  function stop() {
    const capture = current.current;
    if (!capture?.recorder || capture.recorder.state === "inactive") return;
    capture.elapsed = elapsed(capture);
    capture.started = null;
    clearTimers(capture);
    setView((old) => ({
      ...old,
      phase: "stopping",
      elapsedMs: capture.elapsed,
    }));
    try {
      capture.recorder.stop();
    } catch (error) {
      fail(capture, error);
    }
    releaseTracks(capture);
  }
  function schedule(capture: Capture) {
    capture.interval = setInterval(() => {
      if (current.current === capture)
        setView((old) => ({ ...old, elapsedMs: elapsed(capture) }));
    }, 200);
    capture.deadline = setTimeout(
      stop,
      Math.max(0, voiceLimitMs - elapsed(capture)),
    );
  }
  async function start() {
    if (requesting.current || current.current) return;
    discard();
    const id = generation.current;
    let supported = false;
    try {
      supported =
        typeof MediaRecorder !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        MediaRecorder.isTypeSupported(recordingType);
    } catch {
      /* handle a failed codec probe as unsupported */
    }
    if (!supported) {
      setView({
        ...empty,
        error:
          "Voice recording needs a browser with WebM/Opus support, such as an updated Safari or Chrome. You can still read your garden and listen to saved memos.",
      });
      return;
    }
    requesting.current = true;
    setView({ ...empty, phase: "requesting" });
    stopVoicePlayback();
    let capture: Capture | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 48000, channelCount: 1 },
        video: false,
      });
      if (!alive.current || id !== generation.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture = { recorder: null, stream, elapsed: 0, started: null };
      current.current = capture;
      const recorder = new MediaRecorder(stream, {
        mimeType: recordingType,
        audioBitsPerSecond: 64000,
      });
      capture.recorder = recorder;
      const active = capture;
      const chunks: Blob[] = [];
      let bytes = 0;
      if (
        !/^audio\/webm(?:;\s*codecs=["']?opus["']?)?$/i.test(recorder.mimeType)
      )
        throw new Error("Unsupported recorder profile");
      recorder.ondataavailable = (event) => {
        if (current.current !== active || !event.data.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        if (bytes > 12 * 1024 * 1024)
          fail(active, new Error("Recording byte limit"));
      };
      recorder.onerror = () => fail(active, new Error("Recorder error"));
      recorder.onstop = () => {
        if (current.current !== active || !alive.current) return;
        active.elapsed = elapsed(active);
        active.started = null;
        dispose(active);
        current.current = null;
        if (!bytes) {
          setView({
            ...empty,
            error:
              "No audio was recorded. Check your microphone and record again.",
          });
          return;
        }
        const file = new File(chunks, "voice-memo.webm", {
          type: "audio/webm",
        });
        preview.current = URL.createObjectURL(file);
        setView({
          ...empty,
          phase: "review",
          elapsedMs: active.elapsed,
          file,
          preview: preview.current,
        });
      };
      recorder.start(1000);
      if (current.current !== capture) return;
      capture.started = performance.now();
      setView({
        ...empty,
        phase: "recording",
        canPause:
          typeof recorder.pause === "function" &&
          typeof recorder.resume === "function",
      });
      schedule(capture);
    } catch (error) {
      if (capture) dispose(capture);
      if (alive.current && id === generation.current) {
        current.current = null;
        setView({ ...empty, error: captureError(error) });
      }
    } finally {
      if (id === generation.current) requesting.current = false;
    }
  }
  function pause() {
    const capture = current.current;
    if (!capture?.recorder || capture.recorder.state !== "recording") return;
    try {
      capture.recorder.pause();
      capture.elapsed = elapsed(capture);
      capture.started = null;
      clearTimers(capture);
      setView((old) => ({
        ...old,
        phase: "paused",
        elapsedMs: capture.elapsed,
      }));
    } catch (error) {
      fail(capture, error);
    }
  }
  function resume() {
    const capture = current.current;
    if (!capture?.recorder || capture.recorder.state !== "paused") return;
    try {
      stopVoicePlayback();
      capture.recorder.resume();
      capture.started = performance.now();
      setView((old) => ({ ...old, phase: "recording" }));
      schedule(capture);
    } catch (error) {
      fail(capture, error);
    }
  }
  return { ...view, start, stop, pause, resume, discard };
}
