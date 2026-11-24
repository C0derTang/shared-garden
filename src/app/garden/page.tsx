import Link from "next/link";
import { FlowerSprite } from "@/components/garden/flower-sprite";
import { PublicSign } from "@/components/landing/public-sign";
import styles from "@/components/landing/public.module.css";
import { requireMember } from "@/lib/auth/server";
import { legacyPath } from "@/lib/legacy/routes";

export const dynamic = "force-dynamic";

/** Members-only placeholder until the new garden replaces it (decision 0067). */
export default async function GardenPage() {
  await requireMember();
  return (
    <div className={styles.page}>
      <PublicSign />
      <main id="main-content" className={styles.main}>
        <section className={`${styles.card} ${styles.notice}`} aria-labelledby="garden-heading">
          <div className={styles.noticeArt}>
            <FlowerSprite type="rose" growthUnits={1} growthTarget={5} bloomed={false} size={64} />
          </div>
          <p className={styles.eyebrow}>Still growing</p>
          <h1 id="garden-heading">A new garden is coming.</h1>
          <p className={styles.lead}>The old garden is still here in the meantime.</p>
          <div className={styles.actions}>
            <Link href={legacyPath} className="button button-primary">
              Visit the old garden
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
