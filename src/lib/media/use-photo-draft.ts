"use client";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import type { ExternalMutation } from "@/lib/garden/use-garden-sync";
import {
  MediaError,
  mediaRequest,
  photoInputError,
  photoRejected,
  savePhoto,
  type MediaStage,
  type PhotoAttempt,
} from "./browser";
import { mediaGardenField, type MediaGarden } from "./garden";

/** A garden's guarded save for work done elsewhere (media), then a refresh. */
export type MediaMutate = (
  command: ExternalMutation,
) => Promise<{ saved?: boolean; error: string | null }>;

export type PhotoDraftOptions = {
  flowerId: string;
  /** The rendered garden day and its rollover. */
  gardenDay: string;
  nextRolloverAt: string;
  now: number;
  busy: boolean;
  mutate: MediaMutate;
  /** The entry being replaced, if any. */
  editingId?: number;
  /** A replacement whose original edit window has ended. */
  expired: boolean;
  onSaved: () => void;
  garden?: MediaGarden;
};

/**
 * A Sunflower photo from choice to confirmed save, shared by the legacy and
 * new gardens: local preview only, one request identity per chosen photo,
 * explicit review after a new garden day, and rejection that requires a new
 * choice. The view decides how it looks.
 */
export function usePhotoDraft({
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
}: PhotoDraftOptions) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [day, setDay] = useState(gardenDay);
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<MediaStage | null>(null);
  const [rejected, setRejected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<PhotoAttempt | null>(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const boundary = now >= Date.parse(nextRolloverAt);
  const newDay = day !== gardenDay;
  useEffect(() => {
    alive.current = true;
    void mediaRequest("cleanup", mediaGardenField(garden)).catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [garden]);
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
    setDay(gardenDay);
    attempt.current = { requestId: crypto.randomUUID() };
  }
  function remove() {
    setFile(null);
    setPreview(null);
    setPreviewReady(false);
    attempt.current = null;
  }
  function previewFailed() {
    setPreviewReady(false);
    setError(
      "This photo cannot be previewed. Choose or export a supported photo.",
    );
  }
  function keepForToday() {
    setDay(gardenDay);
    setRejected(false);
    attempt.current = { requestId: crypto.randomUUID() };
  }
  const canSubmit =
    !!file &&
    previewReady &&
    !rejected &&
    !pending &&
    !busy &&
    !expired &&
    !boundary &&
    !newDay;
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
              flowerId,
              editingId,
              attempt.current!,
              () => {
                if (!alive.current)
                  throw new Error(
                    "Photo sheet closed. Check your entries before retrying.",
                  );
                checkCurrent();
              },
              garden,
              (next) => {
                if (alive.current) setStage(next);
              },
            );
          } catch (e) {
            if (alive.current && e instanceof MediaError && photoRejected(e.code))
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
    file,
    preview,
    previewReady,
    markPreviewReady: () => setPreviewReady(true),
    previewFailed,
    pending,
    stage,
    rejected,
    error,
    boundary,
    newDay,
    canSubmit,
    choose,
    remove,
    keepForToday,
    submit,
  };
}
