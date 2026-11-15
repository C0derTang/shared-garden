"use client";

import { useEffect, useRef, useState } from "react";
import { parseLyrics, type LyricCue } from "@/lib/landing/lyrics";
import { LyricStage } from "./lyric-stage";
import styles from "./sunset-home.module.css";

function clock(seconds: number) {
  const whole = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function SongPlayer() {
  const media = useRef<HTMLAudioElement>(null);
  const active = useRef(true);
  const lyricRequest = useRef<AbortController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cues, setCues] = useState<LyricCue[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    active.current = true;
    const audio = media.current;
    return () => {
      active.current = false;
      lyricRequest.current?.abort();
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, []);

  async function loadLyrics() {
    if (lyricRequest.current) return;
    const controller = new AbortController();
    lyricRequest.current = controller;
    try {
      const response = await fetch("/api/home/lyrics", {
        cache: "no-store", credentials: "same-origin", signal: controller.signal,
      });
      if (!response.ok) throw new Error("lyrics_unavailable");
      const lyrics = parseLyrics(await response.json());
      if (!lyrics) throw new Error("lyrics_unavailable");
      if (active.current && !controller.signal.aborted) {
        setCues(lyrics.cues);
        setPosition(media.current?.currentTime ?? 0);
      }
    } catch {
      // Optional cues must never prevent playback or reveal a private error.
      if (lyricRequest.current === controller) lyricRequest.current = null;
    }
  }

  async function togglePlayback() {
    const audio = media.current;
    if (!audio) return;
    if (playing) { audio.pause(); return; }
    setFailed(false);
    void loadLyrics();
    // Assign only on activation so even metadata requires the member's action.
    if (!audio.hasAttribute("src")) audio.src = "/api/home/audio";
    if (audio.error) audio.load();
    try { await audio.play(); }
    catch (error) {
      if (!active.current || (error instanceof Error && error.name === "AbortError")) return;
      setPlaying(false);
      setSpinning(false);
      setFailed(true);
    }
  }
  function readDuration() {
    const value = media.current?.duration ?? 0;
    setDuration(Number.isFinite(value) && value > 0 ? value : 0);
  }

  return <div className={styles.playerStage}>
    <LyricStage cues={cues} media={media} playing={playing} position={position} visible={!ended && !failed} />
    <section className={styles.audioPanel} aria-label="愛在 · Khalil Fong">
    <audio ref={media} preload="none" aria-hidden="true"
      onPlay={() => { setPlaying(true); setEnded(false); }} onPlaying={() => setSpinning(true)}
      onWaiting={() => setSpinning(false)} onSeeking={(event) => { setSpinning(false); setPosition(event.currentTarget.currentTime); }}
      onSeeked={(event) => {
        // WebKit may resume buffered audio without emitting another playing event.
        const audio = event.currentTarget;
        setPosition(audio.currentTime);
        setEnded(audio.ended);
        setSpinning(!audio.paused && !audio.ended && !audio.error && audio.readyState >= 3);
      }}
      onPause={() => { setPlaying(false); setSpinning(false); }}
      onEnded={() => { setPlaying(false); setSpinning(false); setEnded(true); }} onLoadedMetadata={readDuration} onDurationChange={readDuration}
      onTimeUpdate={() => setPosition(media.current?.currentTime ?? 0)}
      onError={() => { setPlaying(false); setSpinning(false); setFailed(true); }} />
    <div className={styles.recordSlot} aria-hidden="true"><div className={`${styles.record} ${spinning ? styles.recordPlaying : ""}`} /></div>
    <div className={styles.timeline}>
      <input type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)}
        disabled={!duration} aria-label="Playback position"
        aria-valuetext={`${clock(position)} of ${clock(duration)}`}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (media.current && duration) { media.current.currentTime = value; setPosition(value); }
        }} />
    </div>
    <button className={`${styles.audioPlay} ${failed ? styles.audioFailed : ""}`} type="button" onClick={togglePlayback}
      aria-label={`${playing ? "Pause" : "Play"} 愛在 by Khalil Fong${failed ? " (retry audio)" : ""}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">{playing
        ? <><path d="M26 22v20M38 22v20" className={styles.pauseIcon} /></>
        : <path d="m26 21 17 11-17 11z" />}</svg>
    </button>
    {failed && <p role="status" className={styles.srOnly}>The audio couldn’t load. Try again.</p>}
    </section>
  </div>;
}
