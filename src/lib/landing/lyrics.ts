export type LyricCue = { start: number; end: number; text: string };
export type Lyrics = { version: 1; cues: LyricCue[] };

/** Validate the private interchange format; unknown fields and file metadata are dropped. */
export function parseLyrics(value: unknown): Lyrics | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1 || !Array.isArray(data.cues) || data.cues.length > 1024) return null;
  const cues: LyricCue[] = [];
  let previousEnd = 0;
  for (const candidate of data.cues) {
    if (!candidate || typeof candidate !== "object") return null;
    const { start, end, text } = candidate as Record<string, unknown>;
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)
      || start < previousEnd || end <= start || end > 3600 || typeof text !== "string"
      || !text.trim() || text.length > 500) return null;
    cues.push({ start, end, text: text.trim() });
    previousEnd = end;
  }
  return { version: 1, cues };
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

/** `progress` is the constant-velocity reveal fraction of the shown phrase (0 to 1). */
export type LyricFrame = { index: number; progress: number; resume: number | null };

/** Phrase, reveal progress and resume-dot state for one playback time. */
export function lyricFrame(cues: LyricCue[], time: number): LyricFrame {
  const none: LyricFrame = { index: -1, progress: 0, resume: null };
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
      return { index, progress: Math.min(1, (time - cue.start) / (cue.end - cue.start)), resume: null };
    }
  }
  if (!next) return none;
  const previousEnd = cue ? cue.end + lingerSeconds : 0;
  const remaining = next.start - time;
  if (next.start - (cue?.end ?? 0) < resumeGapSeconds || time < previousEnd
    || remaining > Math.min(resumeShowSeconds, next.start - previousEnd)) return none;
  const lit = Math.min(3, Math.max(0, Math.floor((resumeLeadSeconds - remaining) / (resumeLeadSeconds / 3)) + 1));
  return { index: -1, progress: 0, resume: remaining > resumeLeadSeconds ? 0 : lit };
}

/**
 * Opacity of each character for a left-to-right sweep at `progress`. The sweep moves
 * at constant velocity in character units with a soft edge one character wide.
 */
export function sweepOpacities(count: number, progress: number): number[] {
  const position = Math.min(1, Math.max(0, progress)) * count;
  return Array.from({ length: count }, (_, index) => Math.min(1, Math.max(0, position - index)));
}

export type LyricView = LyricFrame & {
  /** Playback time this view was computed for. */
  time: number;
  /** The fully revealed phrase drifting away after a continuous change; `id` is unique per change. */
  leaving: { index: number; id: number } | null;
};

/** Advance the display; seeks and other jumps switch phrases without a leaving transition. */
export function advanceLyricView(previous: LyricView | null, cues: LyricCue[], time: number): LyricView {
  const frame = lyricFrame(cues, time);
  const jumped = !previous || time < previous.time - 0.05 || time > previous.time + 0.5;
  let leaving = jumped ? null : previous.leaving;
  if (!jumped && previous.index !== frame.index && previous.index >= 0) {
    leaving = { index: previous.index, id: Math.round(time * 1000) };
  }
  return { ...frame, time, leaving };
}

export function sameLyricView(a: LyricView | null, b: LyricView) {
  return !!a && a.index === b.index && a.progress === b.progress && a.resume === b.resume
    && a.leaving?.id === b.leaving?.id;
}
