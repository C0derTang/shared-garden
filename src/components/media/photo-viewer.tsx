"use client";
import { useEffect, useState } from "react";
import { mediaRequest } from "@/lib/media/browser";
import styles from "./photo.module.css";

export function PhotoViewer({ mediaId }: { mediaId: string }) {
  const [source, setSource] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void mediaRequest<{ url: string }>("read", { mediaId }, controller.signal)
      .then((result) => {
        if (active) {
          setSource({ id: mediaId, url: result.url });
          setError(false);
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [mediaId, retry]);
  return (
    <div className={styles.stack}>
      <div className={styles.square}>
        {source?.id === mediaId && !error ? (
          // Signed private URLs must never enter the shared Next image cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source.url}
            alt="Shared Sunflower photo"
            referrerPolicy="no-referrer"
            onError={() => setError(true)}
          />
        ) : (
          <p role="status">
            {error
              ? "This private photo could not load."
              : "Loading private photo…"}
          </p>
        )}
      </div>
      {error && (
        <button
          className="button button-secondary"
          onClick={() => {
            setError(false);
            setSource(null);
            setRetry((n) => n + 1);
          }}
        >
          Reload private photo
        </button>
      )}
    </div>
  );
}
