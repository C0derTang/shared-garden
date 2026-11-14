import { landingFlowers, type LandingData } from "@/lib/landing/types";
import { SpiderLily } from "./spider-lily";
import { EntryCarousel } from "./entry-carousel";
import { PaintedLandscape } from "./painted-landscape";
import styles from "./sunset-home.module.css";

export function SunsetLanding({ data }: { data: LandingData }) {
  if (data.status === "visitor") return (
    <main id="main-content" className={styles.entrance}>
      <form action="/auth/start" method="post">
        <button type="submit" className={styles.login}>Log in</button>
      </form>
    </main>
  );
  return (
    <main id="main-content" className={styles.home}>
      <div className={styles.scenery}><PaintedLandscape /></div>
      <div className={styles.lower}>
        <div className={styles.carousels}>
          {landingFlowers.map((flower) => <EntryCarousel key={flower} flower={flower} entries={data.entries[flower]} unavailable={data.unavailable?.includes(flower)} />)}
        </div>
        <div className={styles.botanical}><SpiderLily /></div>
      </div>
      <footer className={styles.footer}><a href="/garden" className={styles.oldGarden}>old garden</a></footer>
    </main>
  );
}
