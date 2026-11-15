"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { advanceLyricView, sameLyricView, sweepOpacities, type LyricCue, type LyricView } from "@/lib/landing/lyrics";
import { lyricFont } from "./lyric-font";
import styles from "./sunset-home.module.css";

const leaveMilliseconds = 700;

function Phrase({ cue, progress, leaving = false }: { cue: LyricCue; progress: number; leaving?: boolean }) {
  const chars = Array.from(cue.text);
  const opacities = sweepOpacities(chars.length, progress);
  return <p className={`${styles.lyricCue} ${leaving ? styles.lyricLeaving : ""}`}
    data-lyric={leaving ? "leaving" : "current"} aria-hidden={leaving || undefined}>
    {!leaving && <span className={styles.srOnly}>{cue.text}</span>}
    <span aria-hidden="true">{chars.map((char, index) => (
      <span key={index} data-char="" style={{ opacity: Number(opacities[index].toFixed(3)) }}>{char}</span>
    ))}</span>
  </p>;
}

/**
 * Floating phrase display. While playing, a frame loop reads the media clock and sweeps
 * each phrase left to right at constant velocity; paused or seeking positions apply directly.
 */
export function LyricStage({ cues, media, playing, position, visible }: {
  cues: LyricCue[];
  media: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  position: number;
  visible: boolean;
}) {
  const [view, setView] = useState<LyricView | null>(null);
  const latest = useRef<{ cues: LyricCue[]; view: LyricView | null }>({ cues, view: null });

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const audio = media.current;
      const shown = latest.current.view;
      const previous = latest.current.cues === cues ? shown : null;
      const next = visible && cues.length
        ? advanceLyricView(previous, cues, playing && audio ? audio.currentTime : position)
        : null;
      latest.current = { cues, view: next };
      if (!next ? shown !== null : !sameLyricView(shown, next)) setView(next);
      if (playing && next) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cues, media, playing, position, visible]);

  const leavingId = view?.leaving?.id;
  useEffect(() => {
    if (leavingId === undefined) return;
    const timer = setTimeout(() => {
      const current = latest.current.view;
      if (current?.leaving?.id !== leavingId) return;
      const next = { ...current, leaving: null };
      latest.current = { ...latest.current, view: next };
      setView(next);
    }, leaveMilliseconds);
    return () => clearTimeout(timer);
  }, [leavingId]);

  const current = view && view.index >= 0 ? cues[view.index] : undefined;
  const leaving = view?.leaving ? cues[view.leaving.index] : undefined;
  return <div className={`${styles.lyrics} ${lyricFont.className}`} aria-label="Synchronized lyrics" aria-live="off">
    {leaving && view?.leaving && <Phrase key={`leaving-${view.leaving.id}`} cue={leaving} progress={1} leaving />}
    {current && view && <Phrase key={`cue-${view.index}`} cue={current} progress={view.progress} />}
    {view && view.resume !== null && <div className={styles.lyricResume} data-lyric="resume" aria-hidden="true">
      {[1, 2, 3].map((dot) => <span key={dot} data-lit={dot <= (view.resume ?? 0) || undefined} />)}
    </div>}
  </div>;
}
