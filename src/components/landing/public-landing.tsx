import Image from "next/image";
import { SignInButton } from "@/components/auth/sign-in-button";
import { FlowerSprite } from "@/components/garden/flower-sprite";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PixelIcon } from "@/components/ui/pixel-icon";
import type { PublicConfigResult } from "@/lib/config/public";
import { PublicSign } from "./public-sign";
import styles from "./public.module.css";

export function PublicLanding({
  configurationStatus,
}: {
  configurationStatus: PublicConfigResult["status"];
}) {
  const ready = configurationStatus === "ready";
  return (
    <div className={styles.page}>
      <PublicSign note="a little world for two" />
      <main id="main-content" className={styles.main}>
        <section className={styles.hero} aria-labelledby="welcome-heading">
          <div className={`${styles.card} ${styles.heroCard}`}>
            <p className={styles.eyebrow}>Grown together</p>
            <h1 id="welcome-heading" className={styles.title}>
              A little care.
              <br />A lot of <em>us.</em>
            </h1>
            <p className={styles.lead}>
              A quiet place for two people to grow something lovely, one small
              moment at a time.
            </p>
            <div className={styles.actions}>
              {ready && <SignInButton />}
              <BottomSheet
                trigger={
                  <button
                    className={`button ${ready ? "button-secondary" : "button-primary"}`}
                  >
                    Take a little look <PixelIcon name="arrow" />
                  </button>
                }
                title="Small moments, shared"
                description="A little garden made from the things you share."
              >
                <ul className={styles.aboutList}>
                  <li>
                    <FlowerSprite type="rose" growthUnits={5} growthTarget={5} bloomed size={32} />
                    <div>
                      <strong>Care for it together</strong>
                      <p>
                        A note, a song, a small check-in. Everyday moments help
                        your flowers grow.
                      </p>
                    </div>
                  </li>
                  <li>
                    <FlowerSprite type="sunflower" growthUnits={7} growthTarget={7} bloomed size={32} />
                    <div>
                      <strong>Keep the good things</strong>
                      <p>
                        Your flowers hold the memories you make along the way.
                      </p>
                    </div>
                  </li>
                  <li>
                    <FlowerSprite type="cactus" growthUnits={10} growthTarget={10} bloomed size={32} />
                    <div>
                      <strong>A space just for two</strong>
                      <p>
                        One shared garden, with private access for its two people.
                      </p>
                    </div>
                  </li>
                </ul>
              </BottomSheet>
            </div>
            <p className={styles.quiet}>
              <PixelIcon name="heart" /> Little things have a way of growing.
            </p>
          </div>
          <figure className={`${styles.card} ${styles.scene}`}>
            <p className={styles.plaque}>Every little moment counts</p>
            <Image
              src="/garden-scene.svg"
              alt=""
              width={480}
              height={320}
              priority
            />
            <figcaption className={styles.caption}>room to grow, together</figcaption>
          </figure>
        </section>
        <section
          className={`${styles.card} ${styles.little}`}
          aria-labelledby="little-things-heading"
        >
          <p className={styles.eyebrow}>It starts with something small</p>
          <h2 id="little-things-heading">A note. A song. A moment.</h2>
          <p>
            Plant a little kindness. Share a piece of your day. Watch your story
            take root.
          </p>
          <ul className={styles.slots} aria-hidden="true">
            <li><FlowerSprite type="rose" growthUnits={5} growthTarget={5} bloomed size={64} />Note</li>
            <li><FlowerSprite type="tulip" growthUnits={7} growthTarget={7} bloomed size={64} />Song</li>
            <li><FlowerSprite type="cactus" growthUnits={10} growthTarget={10} bloomed size={64} />Moment</li>
          </ul>
        </section>
        <div className={styles.setup} role="status">
          <span className={styles.setupDot} aria-hidden="true" />
          <p>
            <strong>Our garden is taking root.</strong>
            <span>
              {ready
                ? "Private access for the two approved Google accounts."
                : "Garden setup is incomplete. Private access is not available yet."}
            </span>
          </p>
        </div>
      </main>
      <footer className={styles.footer}>
        <span>cc’s garden</span>
        <span>
          Made for the two of you. <PixelIcon name="heart" />
        </span>
      </footer>
    </div>
  );
}
