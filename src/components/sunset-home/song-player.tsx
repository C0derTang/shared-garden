"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./sunset-home.module.css";

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function SongPlayer({ motionPaused, onMotionToggle }: {
  motionPaused: boolean;
  onMotionToggle: () => void;
}) {
  const media = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    active.current = true;
    const audio = media.current;
    return () => {
      active.current = false;
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, []);

  async function togglePlayback() {
    const audio = media.current;
    if (!audio) return;
    if (playing) { audio.pause(); return; }
    setFailed(false);
    // Assign only on activation so even metadata requires the member's action.
    if (!audio.hasAttribute("src")) audio.src = "/api/home/audio";
    if (audio.error) audio.load();
    try { await audio.play(); }
    catch (error) {
      if (!active.current || (error instanceof Error && error.name === "AbortError")) return;
      setPlaying(false);
      setFailed(true);
    }
  }
  function readDuration() {
    const value = media.current?.duration ?? 0;
    setDuration(Number.isFinite(value) && value > 0 ? value : 0);
  }

  return <section className={styles.audioPanel} aria-label="愛在 · Khalil Fong">
    <audio ref={media} preload="none" aria-hidden="true"
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => setPlaying(false)} onLoadedMetadata={readDuration} onDurationChange={readDuration}
      onTimeUpdate={() => setPosition(media.current?.currentTime ?? 0)}
      onVolumeChange={() => setMuted(media.current?.muted ?? false)}
      onError={() => { setPlaying(false); setFailed(true); }} />
    <div className={styles.audioHeading}>
      <div><h1>愛在</h1><p>Khalil Fong</p></div>
      <button type="button" className={styles.motionControl} onClick={onMotionToggle}
        aria-label={motionPaused ? "Resume scenery motion" : "Pause scenery motion"}
        aria-pressed={motionPaused}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{motionPaused
          ? <path d="m9 5 10 7-10 7z" />
          : <><path d="M8 5v14" /><path d="M16 5v14" /></>}</svg>
      </button>
    </div>
    <button className={styles.audioPlay} type="button" onClick={togglePlayback}
      aria-label={`${playing ? "Pause" : "Play"} 愛在 by Khalil Fong`}>
      <svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" />{playing
        ? <><path d="M26 22v20M38 22v20" className={styles.pauseIcon} /></>
        : <path d="m26 21 17 11-17 11z" />}</svg>
    </button>
    <div className={styles.timeline}>
      <input type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)}
        disabled={!duration} aria-label="Playback position"
        aria-valuetext={`${clock(position)} of ${clock(duration)}`}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (media.current && duration) { media.current.currentTime = value; setPosition(value); }
        }} />
      <div className={styles.audioTime}>
        <span>{clock(position)} <span aria-hidden="true">/</span> {clock(duration)}</span>
        <button type="button" className={styles.muteControl} aria-label={muted ? "Unmute audio" : "Mute audio"}
          aria-pressed={muted} onClick={() => {
            if (media.current) { media.current.muted = !muted; setMuted(!muted); }
          }}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z" />{muted
            ? <path d="m16 9 5 6m0-6-5 6" />
            : <><path d="M15 8q4 4 0 8" /><path d="M18 5q7 7 0 14" /></>}</svg>
        </button>
      </div>
    </div>
    {failed && <p role="status" className={styles.audioError}>The audio couldn’t load. Try again.</p>}
  </section>;
}
