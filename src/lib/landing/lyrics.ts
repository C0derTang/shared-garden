export type LyricCue = { start: number; end: number; text: string };
export type Lyrics = { version: 1; cues: LyricCue[] };

/** Validate the private interchange format without forwarding file metadata. */
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

/** Explicit ends leave instrumental gaps blank; seeks need no timer history. */
export function lyricAt(cues: LyricCue[], time: number): LyricCue | undefined {
  return cues.find((cue) => time >= cue.start && time < cue.end);
}
