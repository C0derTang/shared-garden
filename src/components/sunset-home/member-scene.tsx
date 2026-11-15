"use client";

import { useState } from "react";
import { PaintedLandscape } from "./painted-landscape";
import { SpiderLily } from "./spider-lily";
import { SongPlayer } from "./song-player";
import styles from "./sunset-home.module.css";

export function MemberScene() {
  const [paused, setPaused] = useState(false);
  return <main id="main-content" className={`${styles.home} ${paused ? styles.still : ""}`}>
    <div className={styles.scenery} aria-hidden="true"><PaintedLandscape /></div>
    <div className={styles.botanical}><SpiderLily /></div>
    <div className={styles.content}>
      <SongPlayer motionPaused={paused} onMotionToggle={() => setPaused(!paused)} />
    </div>
    <footer className={styles.footer}><a href="/garden" className={styles.oldGarden}>old garden</a></footer>
  </main>;
}
