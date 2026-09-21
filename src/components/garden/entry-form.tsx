"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  canEditAt,
  moods,
  type CatalogItem,
  type Entry,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import { SpotifyPicker } from "@/components/music/spotify-picker";
import { SongPlayer } from "@/components/music/song-player";
import { parseSongLink } from "@/lib/music/song-link";
import type { Mutate } from "./seed-picker";
import styles from "./garden.module.css";

export function EntryForm({
  plant,
  state,
  item,
  now,
  busy,
  mutate,
  editing,
  onSaved,
  onCancel,
  unavailable,
}: {
  plant: Plant;
  state: GardenState;
  item: CatalogItem;
  now: number;
  busy: boolean;
  mutate: Mutate;
  editing?: Entry | null;
  onSaved: () => void;
  onCancel?: () => void;
  unavailable?: string;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    editing?.payload ?? {},
  );
  const [draftDay, setDraftDay] = useState(state.garden_day);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const songTitle = useRef<HTMLInputElement>(null);
  const type = item.type_key;
  const expired = editing && !canEditAt(editing, state, now);
  const hasDraft = Object.values(draft).some(
    (value) => value.trim().length > 0,
  );
  const newDay = draftDay !== state.garden_day && hasDraft;
  const unresolvedRollover = now >= Date.parse(state.next_rollover_at);
  const change = (key: string, value: string) => {
    if (!hasDraft && draftDay !== state.garden_day)
      setDraftDay(state.garden_day);
    setDraft((old) => ({ ...old, [key]: value }));
  };
  const textValid = (value: string | undefined, max: number) =>
    !!value?.trim() && Array.from(value.trim()).length <= max;
  const valid =
    type === "cactus" ||
    (type === "hydrangea"
      ? moods.some((m) => m.key === draft.mood)
      : type === "tulip"
        ? textValid(draft.title, 200) &&
          textValid(draft.artist, 200) &&
          parseSongLink(draft.url?.trim() ?? "").kind !== "invalid"
        : textValid(draft.text, 4000) &&
          (type !== "daisy" || !!plant.daisy_question));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !valid ||
      expired ||
      newDay ||
      unresolvedRollover ||
      unavailable ||
      lock.current ||
      busy
    )
      return;
    lock.current = true;
    setPending(true);
    setError(null);
    const payload: Record<string, string> =
      type === "cactus"
        ? {}
        : type === "tulip"
          ? { title: draft.title, artist: draft.artist, url: draft.url }
          : type === "hydrangea"
            ? { mood: draft.mood }
            : type === "daisy"
              ? {
                  text: draft.text,
                  question_id: plant.daisy_question!.question_id,
                }
              : { text: draft.text };
    try {
      const result = await mutate(
        editing
          ? { kind: "edit", entryId: editing.id, payload }
          : { kind: "submit", flowerId: plant.flower.id, payload },
      );
      setError(result.error);
      if (result.saved) {
        setDraft({});
        onSaved();
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <form
      className={styles.stack}
      onSubmit={(event) => void submit(event)}
      aria-label={editing ? "Edit your care" : "Today's care"}
      aria-busy={pending}
    >
      {editing && <h3>Edit your entry</h3>}
      {type === "tulip" ? (
        <>
          <SpotifyPicker onChoose={(track) => {
            if (!hasDraft && draftDay !== state.garden_day) setDraftDay(state.garden_day);
            setDraft({ title: track.title, artist: track.artist, url: track.url });
            songTitle.current?.focus();
          }} />
          <label className={styles.field}>
            Song title
            <input
              ref={songTitle}
              aria-label="Song title"
              required
              value={draft.title ?? ""}
              onChange={(e) => change("title", e.target.value)}
            />
            <small>Up to 200 characters</small>
          </label>
          <label className={styles.field}>
            Artist
            <input
              aria-label="Artist"
              required
              value={draft.artist ?? ""}
              onChange={(e) => change("artist", e.target.value)}
            />
            <small>Up to 200 characters</small>
          </label>
          <label className={styles.field}>
            Song link
            <input
              aria-label="Song link"
              required
              type="url"
              inputMode="url"
              value={draft.url ?? ""}
              placeholder="https://…"
              onChange={(e) => change("url", e.target.value)}
            />
            <small>
              HTTPS link, up to 512 characters. Review the player before
              sharing; listening is optional.
            </small>
          </label>
          {valid && (
            <div aria-label="Review your song">
              <SongPlayer
                title={draft.title}
                artist={draft.artist}
                url={draft.url.trim()}
              />
            </div>
          )}
        </>
      ) : type === "hydrangea" ? (
        <fieldset className={styles.moodField}>
          <legend>How are you feeling?</legend>
          <div className={styles.moodOptions}>
            {moods.map((mood) => (
              <label className={styles.moodOption} key={mood.key}>
                <input
                  type="radio"
                  name="mood"
                  value={mood.key}
                  checked={draft.mood === mood.key}
                  onChange={() => change("mood", mood.key)}
                />
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: mood.color }}
                />
                {mood.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        type !== "cactus" && (
          <label className={styles.field}>
            {item.action_label}
            <textarea
              aria-label={item.action_label}
              rows={4}
              required
              value={draft.text ?? ""}
              onChange={(e) => change("text", e.target.value)}
            />
            <small>
              {Array.from(draft.text ?? "").length} / 4,000 characters · Visible
              to your partner as soon as you share.
            </small>
          </label>
        )
      )}
      {unavailable && (
        <p className={styles.notice} role="status">
          {unavailable}
        </p>
      )}
      {unresolvedRollover && (
        <p className={styles.notice} role="status">
          Waiting for the current garden day. Your draft stays here; review it
          after the garden refreshes before saving.
        </p>
      )}
      {newDay && !editing && !unresolvedRollover && (
        <div className={styles.notice} role="status">
          <p>
            A new garden day has begun. Review your draft
            {type === "daisy" ? " and today's new question" : ""} before saving.
          </p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setDraftDay(state.garden_day)}
          >
            Use this draft today
          </button>
        </div>
      )}
      {expired && (
        <p className={styles.notice} role="status">
          The edit window has ended. Your draft remains here to copy, but this
          entry is now read-only.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="button button-primary"
        disabled={
          !valid ||
          busy ||
          pending ||
          !!expired ||
          newDay ||
          unresolvedRollover ||
          !!unavailable
        }
      >
        {pending
          ? "Saving…"
          : editing
            ? "Save edit"
            : type === "cactus"
              ? "I’m here · Check in"
              : "Share care"}
      </button>
      {editing && (
        <button
          type="button"
          className="button button-secondary"
          onClick={onCancel}
        >
          Cancel edit
        </button>
      )}
    </form>
  );
}
