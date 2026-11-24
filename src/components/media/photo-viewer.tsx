"use client";
import { useEffect, useState } from "react";
import { mediaRequest } from "@/lib/media/browser";
import { mediaGardenField, type MediaGarden } from "@/lib/media/garden";
import styles from "./photo.module.css";

export function PhotoViewer({
  mediaId,
  garden = "legacy",
  frameClassName,
  alt = "Shared Sunflower photo",
}: {
  mediaId: string;
  /** Which private registry the media belongs to (the new garden passes "v2"). */
  garden?: MediaGarden;
  /** Extra class for the photo's frame, for a garden's own look. */
  frameClassName?: string;
  alt?: string;
}) {
  const [source, setSource] = useState<{ id: string; url: string } | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void mediaRequest<{ url: string }>(
      "read",
      { mediaId, ...mediaGardenField(garden) },
      controller.signal,
    )
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
  }, [mediaId, garden, retry]);
  return (
    <div className={styles.stack}>
      <div
        className={
          frameClassName ? `${styles.square} ${frameClassName}` : styles.square
        }
      >
        {source?.id === mediaId && !error ? (
          // Signed private URLs must never enter the shared Next image cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={source.url}
            alt={alt}
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
