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

/** Validate the private interchange format; unknown fields and file metadata are dropped. */
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

/** Longest per-character ramp; a sooner next onset shortens it so held notes never delay later characters. */
export const charFadeSeconds = 0.12;
const minCharFadeSeconds = 0.04;
/** Longest pause after the sung end before a phrase starts fading. */
export const lingerSeconds = 0.25;
/** Longest exit fade. */
export const exitFadeSeconds = 0.5;
/** Windows shorter than this skip the fade: the phrase is removed when the next one starts. */
const minExitWindowSeconds = 0.05;
/** Gaps at least this long show the resume indicator before the next phrase. */
export const resumeGapSeconds = 5;
/** The indicator lights one dot per second over this final lead-in. */
export const resumeLeadSeconds = 3;
const resumeShowSeconds = 6;

const round = (value: number) => Math.round(value * 100) / 100;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Per-character opacity: onset ramps when onsets exist, else a constant-velocity sweep over the cue. */
export function charOpacities(cue: LyricCue, time: number): number[] {
  const count = Array.from(cue.text).length;
  if (!cue.chars) {
    const position = clamp01((time - cue.start) / (cue.end - cue.start)) * count;
    return Array.from({ length: count }, (_, index) => round(clamp01(position - index)));
  }
  const onsets = cue.chars;
  return onsets.map((onset, index) => {
    const next = onsets[index + 1];
    const ramp = next === undefined ? charFadeSeconds
      : Math.min(charFadeSeconds, Math.max(next - onset, minCharFadeSeconds));
    return round(clamp01((time - onset) / ramp));
  });
}

/**
 * When a phrase starts and finishes its in-place exit fade. The fade always completes no
 * later than the next phrase's start: within the window between this end and the next start,
 * the linger takes at most 40% (up to 250 ms) and the fade the rest (up to 500 ms); windows
 * under 50 ms remove the phrase at the next start without a fade.
 */
export function exitFade(cue: LyricCue, next: LyricCue | undefined) {
  const window = next ? next.start - cue.end : Infinity;
  if (next && window < minExitWindowSeconds) return { start: next.start, end: next.start, duration: 0 };
  const linger = Math.min(lingerSeconds, window * 0.4);
  const duration = Math.min(exitFadeSeconds, window - linger);
  const start = cue.end + linger;
  return { start, end: start + duration, duration };
}

export type LyricPhrase = { index: number; opacity: number; chars: number[] };
/** Visible phrases: at most one, since an exit fade always ends by the next phrase's start. */
export type LyricFrame = { phrases: LyricPhrase[]; resume: number | null };

/** Everything the caption stage shows at one playback time; a pure function of time. */
export function lyricFrame(cues: LyricCue[], time: number): LyricFrame {
  const frame: LyricFrame = { phrases: [], resume: null };
  if (!cues.length || !Number.isFinite(time) || time < 0) return frame;
  let index = -1;
  for (let low = 0, high = cues.length - 1; low <= high;) {
    const middle = (low + high) >> 1;
    if (cues[middle].start <= time) { index = middle; low = middle + 1; } else high = middle - 1;
  }
  const cue = cues[index];
  if (cue) {
    const fade = exitFade(cue, cues[index + 1]);
    if (time < fade.end) frame.phrases.push({
      index,
      opacity: fade.duration > 0 ? round(1 - clamp01((time - fade.start) / fade.duration)) : 1,
      chars: charOpacities(cue, time),
    });
  }
  const next = cues[index + 1];
  if (frame.phrases.length || !next) return frame;
  const previous = cues[index];
  const clearFrom = previous ? exitFade(previous, next).end : 0;
  const remaining = next.start - time;
  if (next.start - (previous?.end ?? 0) < resumeGapSeconds
    || remaining > Math.min(resumeShowSeconds, next.start - clearFrom)) return frame;
  const lit = Math.min(3, Math.max(0, Math.floor((resumeLeadSeconds - remaining) / (resumeLeadSeconds / 3)) + 1));
  return { ...frame, resume: remaining > resumeLeadSeconds ? 0 : lit };
}

export function sameLyricFrame(a: LyricFrame | null, b: LyricFrame | null) {
  if (!a || !b) return a === b;
  return a.resume === b.resume && a.phrases.length === b.phrases.length
    && a.phrases.every((phrase, i) => {
      const other = b.phrases[i];
      return phrase.index === other.index && phrase.opacity === other.opacity
        && phrase.chars.length === other.chars.length && phrase.chars.every((value, k) => value === other.chars[k]);
    });
}
