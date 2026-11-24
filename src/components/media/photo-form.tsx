"use client";
import {
  canEditAt,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import { photoAccept } from "@/lib/media/browser";
import { usePhotoDraft } from "@/lib/media/use-photo-draft";
import type { Mutate } from "@/components/garden/seed-picker";
import styles from "./photo.module.css";

export function PhotoForm({
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
  const draft = usePhotoDraft({
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
  const { file, preview, pending, rejected, error, boundary, newDay } = draft;
  const { choose, submit } = draft;
  return (
    <form
      className={styles.stack}
      aria-label={editing ? "Replace your photo" : "Share a Sunflower photo"}
      aria-busy={pending}
      onSubmit={(e) => void submit(e)}
    >
      {editing && <h3>Replace your photo</h3>}
      <p className={styles.hint}>
        JPEG, PNG or static WebP · up to 12 MiB, 25 million pixels and 12,000
        pixels a side · never cropped; location removed. HEIC? Export or choose
        a supported photo.
      </p>
      <div className={styles.pickers}>
        <label
          className={`button button-secondary ${styles.picker}`}
          data-disabled={pending || busy || undefined}
        >
          <input
            className={styles.fileInput}
            type="file"
            accept={photoAccept}
            onChange={choose}
            disabled={pending || busy}
          />
          Choose photo
        </label>
        <label
          className={`button button-secondary ${styles.picker}`}
          data-disabled={pending || busy || undefined}
        >
          <input
            className={styles.fileInput}
            type="file"
            accept={photoAccept}
            capture="environment"
            onChange={choose}
            disabled={pending || busy}
          />
          Take photo
        </label>
      </div>
      {file && (
        <p className={`${styles.hint} ${styles.fileName}`}>
          Selected: {file.name}
        </p>
      )}
      {file && preview && (
        <>
          <p>Review your photo. It has not been shared yet.</p>
          <div className={styles.square}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={preview}
              src={preview}
              alt="Your photo preview"
              onLoad={draft.markPreviewReady}
              onError={draft.previewFailed}
            />
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={draft.remove}
          >
            Remove selected photo
          </button>
        </>
      )}
      {boundary && (
        <p role="status">
          Waiting for the current garden day. Your photo stays here for review.
        </p>
      )}
      {newDay && !editing && !boundary && (
        <div role="status">
          <p>
            A new garden day has begun. Review this photo before sharing today.
          </p>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={draft.keepForToday}
          >
            Use this photo today
          </button>
        </div>
      )}
      {expired && (
        <p role="status">
          The original edit window has ended. Your saved photo is unchanged.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        className="button button-primary"
        disabled={
          !file ||
          !draft.previewReady ||
          rejected ||
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
            ? "Save replacement photo"
            : "Share photo"}
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
