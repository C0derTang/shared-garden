import Link from "next/link";
import { FlowerSprite } from "@/components/garden/flower-sprite";
import { PublicSign } from "@/components/landing/public-sign";
import styles from "@/components/landing/public.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <PublicSign />
      <main id="main-content" className={styles.main}>
        <section className={`${styles.card} ${styles.notice}`} aria-labelledby="not-found-heading">
          <div className={styles.noticeArt}>
            <FlowerSprite type="rose" growthUnits={1} growthTarget={5} bloomed={false} size={64} />
          </div>
          <p className={styles.eyebrow}>Nothing planted here</p>
          <h1 id="not-found-heading">This path is still growing.</h1>
          <p className={styles.lead}>There’s nothing to see here just yet.</p>
          <div className={styles.actions}>
            <Link href="/" className="button button-primary">
              Back to the garden gate
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
