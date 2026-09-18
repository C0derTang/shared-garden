"use client";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  canEditAt,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import {
  MediaError,
  mediaRequest,
  photoAccept,
  photoInputError,
  savePhoto,
  type PhotoAttempt,
} from "@/lib/media/browser";
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
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [day, setDay] = useState(state.garden_day);
  const [pending, setPending] = useState(false);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<PhotoAttempt | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const expired = !!editing && !canEditAt(editing, state, now);
  const boundary = now >= Date.parse(state.next_rollover_at);
  const newDay = day !== state.garden_day;
  useEffect(() => {
    alive.current = true;
    void mediaRequest("cleanup", {}).catch(() => {});
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  function choose(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected || lock.current) return;
    const invalid = photoInputError(selected);
    setError(invalid);
    if (invalid) return;
    setPreviewReady(false);
    setRejected(false);
    setPreview(URL.createObjectURL(selected));
    setFile(selected);
    setDay(state.garden_day);
    attempt.current = { requestId: crypto.randomUUID() };
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !file ||
      !previewReady ||
      rejected ||
      !attempt.current ||
      pending ||
      busy ||
      lock.current ||
      expired ||
      boundary ||
      newDay
    )
      return;
    lock.current = true;
    setPending(true);
    setError(null);
    let detail: string | null = null;
    try {
      const result = await mutate({
        kind: "external",
        run: async (checkCurrent) => {
          try {
            await savePhoto(
              file,
              plant.flower.id,
              editing?.id,
              attempt.current!,
              () => {
                if (!alive.current)
                  throw new Error(
                    "Photo sheet closed. Check your entries before retrying.",
                  );
                checkCurrent();
              },
            );
          } catch (e) {
            if (
              alive.current &&
              e instanceof MediaError &&
              ([
                "unsupported_photo",
                "invalid_photo",
                "type_mismatch",
                "photo_too_large",
                "photo_size_mismatch",
                "entry_rejected",
              ].includes(e.code) ||
                e.code.startsWith("media_expired"))
            )
              setRejected(true);
            detail =
              e instanceof MediaError
                ? e.message
                : "We could not confirm the save. Check today's entries, then retry this photo when connected.";
            throw e;
          }
        },
      });
      if (!alive.current) return;
      if (result.saved) {
        setFile(null);
        setPreview(null);
        setPreviewReady(false);
        attempt.current = null;
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
      aria-label={editing ? "Replace your photo" : "Share a Sunflower photo"}
      aria-busy={pending}
      onSubmit={(e) => void submit(e)}
    >
      <h3>{editing ? "Replace your photo" : "A photo from your day"}</h3>
      <p>
        JPEG, PNG or static WebP · up to 12 MiB and 25 million pixels · each
        side up to 12,000 pixels. Your whole photo stays uncropped. Location
        metadata is removed before sharing.
      </p>
      <p>
        If your camera returns HEIC, choose or export a supported photo without
        resizing it.
      </p>
      <div className={styles.pickers}>
        <label>
          Choose photo
          <input
            type="file"
            accept={photoAccept}
            onChange={choose}
            disabled={pending || busy}
          />
        </label>
        <label>
          Take photo
          <input
            type="file"
            accept={photoAccept}
            capture="environment"
            onChange={choose}
            disabled={pending || busy}
          />
        </label>
      </div>
      {file && preview && (
        <>
          <p>Review your photo. It has not been shared yet.</p>
          <div className={styles.square}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={preview}
              src={preview}
              alt="Your photo preview"
              onLoad={() => setPreviewReady(true)}
              onError={() => {
                setPreviewReady(false);
                setError(
                  "This photo cannot be previewed. Choose or export a supported photo.",
                );
              }}
            />
          </div>
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={() => {
              setFile(null);
              setPreview(null);
              setPreviewReady(false);
              attempt.current = null;
            }}
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
            onClick={() => {
              setDay(state.garden_day);
              setRejected(false);
              attempt.current = { requestId: crypto.randomUUID() };
            }}
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
          !previewReady ||
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
