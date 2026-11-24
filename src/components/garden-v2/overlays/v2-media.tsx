"use client";
import { useEffect, useRef, useState } from "react";
import { VoicePlayer } from "@/components/media/voice-player";
import { mediaGardenField, mediaRequest } from "@/lib/media/browser";
import { voiceTime } from "@/lib/media/use-voice-recorder";
import styles from "./overlays.module.css";

/**
 * Private new-garden media for Memories. Reads go through the same member-only
 * `/api/media/read` route with the server-validated `garden: "v2"`
 * discriminator (decision 0067, #178). As in decision 0018, nothing is signed
 * or mounted until the viewer asks: "load photo" / "load voice memo".
 */
const v2 = mediaGardenField("v2");

/** A Sunflower photo: a painted frame until asked, then the whole photo, never cropped. */
export function V2Photo({ mediaId }: { mediaId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.photo}>
      {open ? (
        <PhotoFrame key={mediaId} mediaId={mediaId} />
      ) : (
        <div className={styles.photoPlaceholder} role="img" aria-label="Private Sunflower photo, not loaded">
          <span aria-hidden="true">✿</span>
        </div>
      )}
      <button type="button" className={styles.mediaToggle} onClick={() => setOpen(!open)}>
        {open ? "close photo" : "load private photo"}
      </button>
    </div>
  );
}

function PhotoFrame({ mediaId }: { mediaId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void mediaRequest<{ url: string }>("read", { mediaId, ...v2 }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [mediaId, retry]);
  return (
    <div className={styles.photoFrame}>
      {url && !error ? (
        // Signed private URLs must never enter the shared Next image cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Shared Sunflower photo" referrerPolicy="no-referrer" onError={() => setError(true)} />
      ) : (
        <p role="status" className={styles.mediaStatus}>
          {error ? "This private photo could not load." : "Loading private photo…"}
        </p>
      )}
      {error && (
        <button
          type="button"
          className={styles.mediaToggle}
          onClick={() => {
            setError(false);
            setUrl(null);
            setRetry((n) => n + 1);
          }}
        >
          reload photo
        </button>
      )}
    </div>
  );
}

/** A Bluebell voice memo: loads only when asked; the player never autoplays. */
export function V2Voice({ mediaId }: { mediaId: string }) {
  return <PrivateVoice key={mediaId} mediaId={mediaId} />;
}

function PrivateVoice({ mediaId }: { mediaId: string }) {
  const [source, setSource] = useState<{ url: string; durationMs: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(false);
    setSource(null);
    try {
      const result = await mediaRequest<{ url: string; durationMs: number }>("read", { mediaId, ...v2 }, controller.signal);
      if (!controller.signal.aborted) setSource(result);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className={styles.voice}>
      {source && !error && (
        <>
          <p className={styles.mediaStatus}>{voiceTime(source.durationMs)}</p>
          <VoicePlayer source={source.url} label="Shared Bluebell voice memo" onError={() => setError(true)} />
        </>
      )}
      {error && (
        <p role="status" className={styles.mediaStatus}>
          This private memo could not load. Try again.
        </p>
      )}
      {(!source || error) && (
        <button type="button" className={styles.mediaToggle} disabled={busy} onClick={() => void load()}>
          {busy ? "loading voice memo…" : error ? "reload voice memo" : "load voice memo"}
        </button>
      )}
    </div>
  );
}
