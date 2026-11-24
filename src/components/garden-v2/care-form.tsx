"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { SongPlayer } from "@/components/music/song-player";
import { SpotifyPicker } from "@/components/music/spotify-picker";
import { characters, draftHasContent, draftValid, ENTRY_TEXT_LIMIT, entryPayload, SONG_FIELD_LIMIT } from "@/lib/garden/entry-draft";
import { MOOD_NOTE_LIMIT, moods, OTHER_MOOD, toggleMood } from "@/lib/garden/moods";
import type { SyncMutation } from "@/lib/garden/use-garden-sync";
import { canEditAt, type CatalogItem, type Entry, type GardenCommand, type GardenResult, type GardenState, type Plant } from "@/lib/garden-v2/model";
import styles from "./garden-v2.module.css";

/** A garden command, or work done elsewhere (media, Peony) followed by a refresh. */
export type MutateV2 = (command: SyncMutation<GardenCommand>) => Promise<GardenResult>;

/** Placeholder prompts for the text flowers, in the garden's voice. */
const PROMPTS: Partial<Record<string, string>> = {
  rose: "a little note about today…",
  marigold: "something you appreciate about them…",
  daisy: "your answer…",
  snapdragon: "honestly, how are you…",
  moonflower: "a late-night thought…",
  dandelion: "a detail to add to your wish…",
  "forget-me-not": "a memory you share…",
};

/**
 * Today's care for one flower, or an edit of your entry within its window.
 * Validation and the payload come from the shared entry-draft rules; the
 * server checks everything again.
 */
export function CareForm({
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
  mutate: MutateV2;
  editing?: Entry | null;
  onSaved: () => void;
  onCancel?: () => void;
  /** Why sharing is closed right now (e.g. a Moonflower outside its hours); the draft stays. */
  unavailable?: string;
}) {
  const partner = usePartnerName();
  const id = useId();
  const [draft, setDraft] = useState<Record<string, string>>(editing?.payload ?? {});
  const [draftDay, setDraftDay] = useState(state.garden_day);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const songTitle = useRef<HTMLInputElement>(null);
  const type = item.type_key;
  const expired = !!editing && !canEditAt(editing, state, now);
  const hasDraft = draftHasContent(draft);
  const newDay = draftDay !== state.garden_day && hasDraft;
  const unresolvedRollover = now >= Date.parse(state.next_rollover_at);
  const context = { daisyQuestionId: plant.daisy_question?.question_id };
  const valid = draftValid(type, draft, context);
  const optionalMood = type === "hydrangea" && plant.flower.first_bloom_at !== null;

  const touch = () => {
    if (!hasDraft && draftDay !== state.garden_day) setDraftDay(state.garden_day);
  };
  const change = (key: string, value: string) => {
    touch();
    setDraft((old) => ({ ...old, [key]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || expired || newDay || unresolvedRollover || unavailable || lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const payload = entryPayload(type, draft, context);
      const result = await mutate(
        editing ? { kind: "edit", entryId: editing.id, payload } : { kind: "submit", flowerId: plant.flower.id, payload },
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

  const label = editing ? "Edit your entry" : optionalMood ? "Today's optional mood" : "Today's care";
  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} aria-label={label} aria-busy={pending}>
      {type === "tulip" ? (
        <>
          <SpotifyPicker
            onChoose={(track) => {
              touch();
              setDraft({ title: track.title, artist: track.artist, url: track.url });
              songTitle.current?.focus();
            }}
          />
          <label className={styles.field}>
            <span>Song title</span>
            <input ref={songTitle} required maxLength={SONG_FIELD_LIMIT} value={draft.title ?? ""} onChange={(e) => change("title", e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Artist</span>
            <input required maxLength={SONG_FIELD_LIMIT} value={draft.artist ?? ""} onChange={(e) => change("artist", e.target.value)} />
          </label>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>Song link</span>
              <input
                required
                type="url"
                inputMode="url"
                placeholder="https://…"
                value={draft.url ?? ""}
                onChange={(e) => change("url", e.target.value)}
                aria-describedby={`${id}-url`}
              />
            </label>
            <small id={`${id}-url`}>An HTTPS link, up to 512 characters. Review the player before sharing.</small>
          </div>
          {valid && (
            <div aria-label="Review your song">
              <SongPlayer title={draft.title!} artist={draft.artist!} url={draft.url!.trim()} />
            </div>
          )}
        </>
      ) : type === "hydrangea" ? (
        <>
          <fieldset className={styles.moods}>
            <legend>{optionalMood ? "Your color today (optional)" : "How are you feeling?"}</legend>
            <p className={styles.formHint}>Pick up to two colors, or Other if none fit. They tint the hydrangea.</p>
            <div className={styles.moodOptions}>
              {moods.map((mood) => {
                const chosen = draft.mood === mood.key || draft.mood2 === mood.key;
                return (
                  <label className={styles.moodOption} key={mood.key} data-chosen={chosen || undefined}>
                    <input
                      type="checkbox"
                      checked={chosen}
                      disabled={!!draft.mood2 && !chosen}
                      onChange={() => {
                        touch();
                        setDraft((old) => toggleMood(old, mood.key));
                      }}
                    />
                    <span className={styles.swatch} style={{ backgroundColor: mood.color }} aria-hidden="true" />
                    <span>{mood.label}</span>
                  </label>
                );
              })}
              <label className={styles.moodOption} data-chosen={draft.mood === OTHER_MOOD || undefined}>
                <input
                  type="checkbox"
                  checked={draft.mood === OTHER_MOOD}
                  onChange={() => {
                    touch();
                    setDraft((old) => toggleMood(old, OTHER_MOOD));
                  }}
                />
                <span className={`${styles.swatch} ${styles.otherSwatch}`} aria-hidden="true" />
                <span>Other</span>
              </label>
            </div>
          </fieldset>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>{draft.mood === OTHER_MOOD ? "Briefly, why?" : "Briefly, why? (optional)"}</span>
              <textarea
                rows={2}
                required={draft.mood === OTHER_MOOD}
                maxLength={MOOD_NOTE_LIMIT}
                value={draft.note ?? ""}
                onChange={(e) => change("note", e.target.value)}
                aria-describedby={`${id}-note`}
              />
            </label>
            <small id={`${id}-note`}>
              {characters(draft.note)} / {MOOD_NOTE_LIMIT} · {partner.subject} can see it.
            </small>
          </div>
        </>
      ) : type === "cactus" ? (
        <p className={styles.formHint}>A one-tap check-in: “I’m here.”</p>
      ) : (
        <div className={styles.field}>
          <label className={styles.fieldLabel}>
            <span>{item.action_label}</span>
            <textarea
              rows={4}
              required
              placeholder={PROMPTS[type]}
              value={draft.text ?? ""}
              onChange={(e) => change("text", e.target.value)}
              aria-describedby={`${id}-text`}
            />
          </label>
          <small id={`${id}-text`}>
            {characters(draft.text).toLocaleString("en-US")} / {ENTRY_TEXT_LIMIT.toLocaleString("en-US")} · {partner.subject} sees it as soon as you
            share.
          </small>
        </div>
      )}
      {unavailable && (
        <p className={styles.note} role="status">
          {unavailable}
        </p>
      )}
      {unresolvedRollover && (
        <p className={styles.note} role="status">
          A new garden day is starting. Your draft stays here; review it after the garden refreshes.
        </p>
      )}
      {newDay && !editing && !unresolvedRollover && (
        <div className={styles.note} role="status">
          <p>A new garden day has begun. Review your draft{type === "daisy" ? " and today’s new question" : ""} before sharing.</p>
          <button type="button" className={styles.textButton} onClick={() => setDraftDay(state.garden_day)}>
            Use this draft today
          </button>
        </div>
      )}
      {expired && (
        <p className={styles.note} role="status">
          The edit window has ended. Your draft stays here to copy, but the entry is now read-only.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.primary}
          disabled={!valid || busy || pending || expired || newDay || unresolvedRollover || !!unavailable}
        >
          {pending ? "saving…" : editing ? "save edit" : type === "cactus" ? "I’m here" : optionalMood ? "save my color" : "share"}
        </button>
        {editing && (
          <button type="button" className={styles.textButton} onClick={onCancel}>
            cancel
          </button>
        )}
      </div>
    </form>
  );
}
