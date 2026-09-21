import Image from "next/image";
import { SignInButton } from "@/components/auth/sign-in-button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PixelIcon } from "@/components/ui/pixel-icon";
import type { PublicConfigResult } from "@/lib/config/public";

export function PublicLanding({
  configurationStatus,
}: {
  configurationStatus: PublicConfigResult["status"];
}) {
  return (
    <div className="landing">
      <header className="public-header">
        <span className="wordmark">
          <PixelIcon name="sprout" />
          cc’s garden
        </span>
        <span className="header-note">a little world for two</span>
      </header>
      <main id="main-content">
        <section className="hero" aria-labelledby="welcome-heading">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="tiny-spark" aria-hidden="true">
                ✦
              </span>{" "}
              GROWN TOGETHER
            </p>
            <h1 id="welcome-heading">
              A little care.
              <br />A lot of <em>us.</em>
            </h1>
            <p className="hero-description">
              A quiet place for two people to grow something lovely, one small
              moment at a time.
            </p>
            {configurationStatus === "ready" && <SignInButton />}
            <BottomSheet
              trigger={
                <button className="button button-primary">
                  Take a little look <PixelIcon name="arrow" />
                </button>
              }
              title="Small moments, shared"
              description="A little garden made from the things you share."
            >
              <ul className="about-list">
                <li>
                  <PixelIcon name="sprout" />
                  <div>
                    <strong>Care for it together</strong>
                    <p>
                      A note, a song, a small check-in. Everyday moments help
                      your flowers grow.
                    </p>
                  </div>
                </li>
                <li>
                  <PixelIcon name="book" />
                  <div>
                    <strong>Keep the good things</strong>
                    <p>
                      Your flowers hold the memories you make along the way.
                    </p>
                  </div>
                </li>
                <li>
                  <PixelIcon name="heart" />
                  <div>
                    <strong>A space just for two</strong>
                    <p>
                      One shared garden, with private access for its two people.
                    </p>
                  </div>
                </li>
              </ul>
            </BottomSheet>
            <p className="quiet-note">
              <PixelIcon name="heart" /> Little things have a way of growing.
            </p>
          </div>
          <div className="garden-illustration">
            <div className="illustration-label">
              <span aria-hidden="true">✦</span> EVERY LITTLE MOMENT COUNTS
            </div>
            <Image
              src="/garden-scene.svg"
              alt=""
              width={720}
              height={580}
              priority
              className="garden-scene"
            />
            <p className="illustration-caption">room to grow, together</p>
          </div>
        </section>
        <section
          className="little-things"
          aria-labelledby="little-things-heading"
        >
          <p className="eyebrow">IT STARTS WITH SOMETHING SMALL</p>
          <h2 id="little-things-heading">A note. A song. A moment.</h2>
          <p>
            Plant a little kindness. Share a piece of your day.
            <br className="desktop-break" /> Watch your story take root.
          </p>
          <div className="little-things-icons" aria-hidden="true">
            <PixelIcon name="sprout" />
            <span>·</span>
            <PixelIcon name="heart" />
            <span>·</span>
            <PixelIcon name="flower" />
          </div>
        </section>
        <div className="setup-note" role="status">
          <span className="setup-dot" aria-hidden="true" />
          <p>
            <strong>Our garden is taking root.</strong>
            <span>
              {configurationStatus === "ready"
                ? "Private access for the two approved Google accounts."
                : "Garden setup is incomplete. Private access is not available yet."}
            </span>
          </p>
        </div>
      </main>
      <footer className="public-footer">
        <span>cc’s garden</span>
        <span>
          Made for the two of you. <PixelIcon name="heart" />
        </span>
      </footer>
    </div>
  );
}
