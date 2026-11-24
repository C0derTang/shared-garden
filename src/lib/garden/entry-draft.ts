/**
 * Daily-care drafts shared by the legacy and new gardens: which fields a
 * flower's entry has, whether a draft is ready to share, and the exact payload
 * sent to the server. Pure; the server validates again.
 */
import { parseSongLink } from "@/lib/music/song-link";
import { moodPick } from "./moods";

export const ENTRY_TEXT_LIMIT = 4000;
export const SONG_FIELD_LIMIT = 200;

/** Flowers whose care is the ordinary entry form (not media or Peony milestones). */
export const ENTRY_FORM_TYPES = [
  "rose",
  "cactus",
  "tulip",
  "marigold",
  "daisy",
  "hydrangea",
  "snapdragon",
  "moonflower",
  "dandelion",
  "forget-me-not",
] as const;

export const characters = (value: string | undefined) => Array.from(value ?? "").length;

/** Trimmed text of 1..max characters. */
export function textValid(value: string | undefined, max: number) {
  return !!value?.trim() && characters(value.trim()) <= max;
}

export interface DraftContext {
  /** The Daisy question assigned for today, if any. */
  readonly daisyQuestionId?: string | null;
}

/** True when the draft can be shared for this flower type. */
export function draftValid(type: string, draft: Record<string, string>, context: DraftContext = {}) {
  if (type === "cactus") return true;
  if (type === "hydrangea") return moodPick(draft) !== null;
  if (type === "tulip")
    return (
      textValid(draft.title, SONG_FIELD_LIMIT) &&
      textValid(draft.artist, SONG_FIELD_LIMIT) &&
      parseSongLink(draft.url?.trim() ?? "").kind !== "invalid"
    );
  return textValid(draft.text, ENTRY_TEXT_LIMIT) && (type !== "daisy" || !!context.daisyQuestionId);
}

/** The payload a valid draft sends: only the fields the server accepts for the type. */
export function entryPayload(type: string, draft: Record<string, string>, context: DraftContext = {}): Record<string, string> {
  if (type === "cactus") return {};
  if (type === "tulip") return { title: draft.title!, artist: draft.artist!, url: draft.url! };
  if (type === "hydrangea") {
    const pick = moodPick(draft);
    return pick ? { ...pick } : {};
  }
  if (type === "daisy") return { text: draft.text!, question_id: context.daisyQuestionId ?? "" };
  return { text: draft.text! };
}

/** True when any field of the draft holds something. */
export const draftHasContent = (draft: Record<string, string>) => Object.values(draft).some((value) => value.trim().length > 0);
