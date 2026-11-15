/** `chars` holds optional absolute onset seconds, one per code point of `text`. */
export type LyricCue = { start: number; end: number; text: string; chars?: number[] };
export type Lyrics = { version: 1; cues: LyricCue[] };

function validOnsets(value: unknown, start: number, end: number, length: number): value is number[] {
  if (!Array.isArray(value) || value.length !== length) return false;
  let previous = start;
  for (const onset of value) {
    if (typeof onset !== "number" || !Number.isFinite(onset) || onset < previous || onset >= end) return false;
    previous = onset;
  }
  return true;
}

/** Validate the private interchange format without forwarding file metadata. */
export function parseLyrics(value: unknown): Lyrics | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.cues) || data.cues.length > 1024) return null;
  const cues: LyricCue[] = [];
  let previousEnd = 0;
  for (const candidate of data.cues) {
    if (!candidate || typeof candidate !== "object") return null;
    const { start, end, text, chars } = candidate as Record<string, unknown>;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)
      || start < previousEnd || end <= start || end > 3600 || typeof text !== "string"
      || !text.trim() || text.length > 500) return null;
    const trimmed = text.trim();
    if (chars === undefined) cues.push({ start, end, text: trimmed });
    else if (validOnsets(chars, start, end, Array.from(trimmed).length)) {
      cues.push({ start, end, text: trimmed, chars: [...chars] });
    } else return null;
    previousEnd = end;
  }
  return { version: 1, cues };
}

/** Supplied onsets, or an even reveal across the first 80% of cues without them. */
export function charOnsets(cue: LyricCue): number[] {
  if (cue.chars) return cue.chars;
  const count = Array.from(cue.text).length;
  const step = ((cue.end - cue.start) * 0.8) / count;
  return Array.from({ length: count }, (_, index) => cue.start + index * step);
}

/** Gaps up to this long keep the previous phrase until the next one starts. */
export const holdGapSeconds = 2;
/** A phrase before a longer gap stays this long after its sung end. */
export const lingerSeconds = 0.8;
/** Gaps at least this long show the resume indicator before the next phrase. */
export const resumeGapSeconds = 5;
/** The indicator lights one dot per second over this final lead-in. */
export const resumeLeadSeconds = 3;
const resumeShowSeconds = 6;

export type LyricFrame = { index: number; revealed: number; resume: number | null };

/** Phrase, revealed character count and resume-dot state for one playback time. */
export function lyricFrame(cues: LyricCue[], time: number): LyricFrame {
  const none: LyricFrame = { index: -1, revealed: 0, resume: null };
  if (!cues.length || !Number.isFinite(time) || time < 0) return none;
  let index = -1;
  for (let low = 0, high = cues.length - 1; low <= high;) {
    const middle = (low + high) >> 1;
    if (cues[middle].start <= time) { index = middle; low = middle + 1; } else high = middle - 1;
  }
  const cue = cues[index];
  const next = cues[index + 1];
  if (cue) {
    const gap = next ? next.start - cue.end : Infinity;
    if (time < cue.end || gap <= holdGapSeconds || time < cue.end + lingerSeconds) {
      return { index, revealed: charOnsets(cue).filter((onset) => onset <= time).length, resume: null };
    }
  }
  if (!next) return none;
  const previousEnd = cue ? cue.end + lingerSeconds : 0;
  const remaining = next.start - time;
  if (next.start - (cue?.end ?? 0) < resumeGapSeconds || time < previousEnd
    || remaining > Math.min(resumeShowSeconds, next.start - previousEnd)) return none;
  const lit = Math.min(3, Math.max(0, Math.floor((resumeLeadSeconds - remaining) / (resumeLeadSeconds / 3)) + 1));
  return { index: -1, revealed: 0, resume: remaining > resumeLeadSeconds ? 0 : lit };
}

export type LyricView = LyricFrame & {
  /** Playback time this view was computed for. */
  time: number;
  /** Characters before this index appear without the reveal animation. */
  settled: number;
  /** The phrase drifting away after a continuous change, at most one; `id` is unique per change. */
  leaving: { index: number; revealed: number; id: number } | null;
};

/**
 * Advance the display from its previous state. Seeks and other jumps settle every
 * revealed character immediately; continuous playback animates newly crossed ones.
 */
export function advanceLyricView(previous: LyricView | null, cues: LyricCue[], time: number): LyricView {
  const frame = lyricFrame(cues, time);
  const jumped = !previous || time < previous.time - 0.05 || time > previous.time + 0.5;
  let settled = frame.revealed;
  let leaving = previous?.leaving ?? null;
  if (!jumped && previous) {
    if (previous.index === frame.index) settled = Math.min(previous.settled, frame.revealed);
    else {
      const cue = cues[frame.index];
      settled = cue ? charOnsets(cue).filter((onset) => onset <= time - 0.25).length : 0;
      if (previous.index >= 0) {
        leaving = { index: previous.index, revealed: previous.revealed, id: Math.round(time * 1000) };
      }
    }
  } else if (jumped) leaving = null;
  return { ...frame, time, settled, leaving };
}

export function sameLyricView(a: LyricView | null, b: LyricView) {
  return !!a && a.index === b.index && a.revealed === b.revealed && a.resume === b.resume
    && a.settled === b.settled && a.leaving?.id === b.leaving?.id;
}
