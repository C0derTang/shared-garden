"use client";
import { useEffect, useRef, useState } from "react";
import { mediaRequest } from "@/lib/media/browser";
import { stopVoicePlayback, voiceTime } from "@/lib/media/use-voice-recorder";
import styles from "./voice.module.css";

export function VoicePlayer({
  source,
  label,
  onReady,
  onError,
}: {
  source: string;
  label: string;
  onReady?: () => void;
  onError?: () => void;
}) {
  return <VoiceAudio key={source} {...{ source, label, onReady, onError }} />;
}
function VoiceAudio({
  source,
  label,
  onReady,
  onError,
}: {
  source: string;
  label: string;
  onReady?: () => void;
  onError?: () => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current;
    // Restore the source if development StrictMode replayed the cleanup.
    audio?.setAttribute("src", source);
    return () => {
      audio?.pause();
      audio?.removeAttribute("src");
    };
  }, [source]);
  return (
    <audio
      ref={ref}
      className={styles.player}
      data-garden-voice
      controls
      preload="metadata"
      src={source}
      aria-label={label}
      onCanPlay={onReady}
      onError={onError}
      onPlay={(event) => stopVoicePlayback(event.currentTarget)}
    />
  );
}

/** Reusable member-only viewer for current entries, history and Memories. */
export function VoiceViewer({ mediaId }: { mediaId: string }) {
  return <PrivateVoice key={mediaId} mediaId={mediaId} />;
}
function PrivateVoice({ mediaId }: { mediaId: string }) {
  const [source, setSource] = useState<{
    url: string;
    durationMs: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (request.current && !request.current.signal.aborted && busy) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    setSource(null);
    try {
      const result = await mediaRequest<{ url: string; durationMs: number }>(
        "read",
        { mediaId },
        controller.signal,
      );
      if (!controller.signal.aborted) setSource(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className={styles.stack}>
      {source && !error && (
        <>
          <p>Duration: {voiceTime(source.durationMs)}</p>
          <VoicePlayer
            source={source.url}
            label="Shared Bluebell voice memo"
            onError={() => setError(true)}
          />
        </>
      )}
      {error && (
        <p role="status">
          This private memo could not load. Request fresh access and try again.
        </p>
      )}
      {(!source || error) && (
        <button
          className="button button-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy
            ? "Loading private memo…"
            : error
              ? "Reload private memo"
              : "Load voice memo"}
        </button>
      )}
    </div>
  );
}
