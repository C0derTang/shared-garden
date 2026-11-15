"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { lyricFrame, sameLyricFrame, type LyricCue, type LyricFrame, type LyricPhrase } from "@/lib/landing/lyrics";
import { lyricFont } from "./lyric-font";
import styles from "./sunset-home.module.css";

/**
 * The display runs 40 ms ahead of the media clock: about one frame of sampling and
 * compositing delay plus part of each character's ramp, so a character is legible as its
 * syllable is heard, while staying small enough not to show visibly before the sound.
 */
export const visualLeadSeconds = 0.04;

function Phrase({ cue, phrase }: { cue: LyricCue; phrase: LyricPhrase }) {
  return <p className={styles.lyricCue} data-lyric="current" style={{ opacity: phrase.opacity }}>
    <span className={styles.srOnly}>{cue.text}</span>
    <span aria-hidden="true">{Array.from(cue.text).map((char, index) => (
      <span key={index} data-char="" style={{ opacity: phrase.chars[index] }}>{char}</span>
    ))}</span>
  </p>;
}

/**
 * Floating phrase display. While playing, a frame loop reads the media clock; paused or
 * seeking positions apply directly, since every frame is a pure function of time.
 */
export function LyricStage({ cues, media, playing, position, visible }: {
  cues: LyricCue[];
  media: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  position: number;
  visible: boolean;
}) {
  const [frame, setFrame] = useState<LyricFrame | null>(null);
  const shown = useRef<LyricFrame | null>(null);

  useEffect(() => {
    let request = 0;
    const tick = () => {
      const audio = media.current;
      const time = (playing && audio ? audio.currentTime : position) + visualLeadSeconds;
      const next = visible && cues.length ? lyricFrame(cues, time) : null;
      if (!sameLyricFrame(shown.current, next)) { shown.current = next; setFrame(next); }
      if (playing && next) request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [cues, media, playing, position, visible]);

  const phrases = frame?.phrases.filter((phrase) => cues[phrase.index]) ?? [];
  return <div className={`${styles.lyrics} ${lyricFont.className}`} aria-label="Synchronized lyrics" aria-live="off">
    {phrases.map((phrase) => <Phrase key={phrase.index} cue={cues[phrase.index]} phrase={phrase} />)}
    {frame && frame.resume !== null && <div className={styles.lyricResume} data-lyric="resume" aria-hidden="true">
      {[1, 2, 3].map((dot) => <span key={dot} data-lit={dot <= (frame.resume ?? 0) || undefined} />)}
    </div>}
  </div>;
}
