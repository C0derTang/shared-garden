import { PaintedLandscape } from "./painted-landscape";
import { SpiderLily } from "./spider-lily";
import { SongPlayer } from "./song-player";
import { legacyPath } from "@/lib/legacy/routes";
import styles from "./sunset-home.module.css";

export function MemberScene() {
  return <main id="main-content" className={styles.home}>
    <div className={styles.scenery} aria-hidden="true"><PaintedLandscape /></div>
    <div className={styles.botanical}><SpiderLily /></div>
    <div className={styles.content}>
      <SongPlayer />
    </div>
    <footer className={styles.footer}><a href={legacyPath} className={styles.oldGarden}>old garden</a></footer>
  </main>;
}
