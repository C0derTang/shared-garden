"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { GardenGuide } from "@/components/settings/garden-guide";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import {
  pacificTime,
  type CatalogItem,
  type GardenResult,
  type GardenState,
  type Plant,
} from "@/lib/garden/model";
import { useGarden } from "@/lib/garden/use-garden";
import { FlowerSprite } from "./flower-sprite";
import { FlowerSheet } from "./flower-sheet";
import { SeedPicker, type Mutate } from "./seed-picker";
import styles from "./garden.module.css";

// Fixed offsets repeat within each twelve-spot bed. Plant IDs never move.
const positions = [
  [18, 70],
  [52, 91],
  [82, 55],
  [15, 215],
  [49, 244],
  [81, 205],
  [20, 365],
  [53, 392],
  [84, 354],
  [15, 517],
  [48, 539],
  [81, 512],
];
function GardenSpot({
  spot,
  plant,
  item,
  state,
  now,
  busy,
  mutate,
  open,
  setOpen,
}: {
  spot: number;
  plant?: Plant;
  item?: CatalogItem;
  state: GardenState;
  now: number;
  busy: boolean;
  mutate: Mutate;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [picking, setPicking] = useState(!plant);
  // Reopening after a successful plant must show the new flower’s care sheet.
  if (!open && picking !== !plant) setPicking(!plant);
  const [x, y] = positions[(spot - 1) % 12];
  const bloom = !!plant?.flower.first_bloom_at;
  const cared = plant
    ? Number(plant.member1_submitted) + Number(plant.member2_submitted)
    : 0;
  return (
    <div className={styles.spot} style={{ left: `${x}%`, top: y }}>
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (next) setPicking(!plant);
          setOpen(next);
        }}
        title={
          !picking && item ? item.display_name : "Plant something together"
        }
        description={
          plant
            ? `${item!.action_label}. Your shared progress, today’s care, and memories.`
            : "Every seed has its own small ritual."
        }
        trigger={
          <button
            className={plant ? styles.flowerButton : styles.emptyButton}
            aria-label={
              plant
                ? `${item!.display_name}, spot ${spot}, ${plant.flower.fulfilled_at ? "fulfilled wish" : bloom ? "permanent bloom" : `${plant.flower.growth_units} of ${item!.growth_target} ${plant.flower.type_key === "peony" ? "milestones" : "growth units"}`}${plant.flower.type_key === "peony" ? "" : `, ${cared} of 2 cared today`}`
                : `Plant in spot ${spot}`
            }
          >
            {plant ? (
              <>
                <FlowerSprite
                  {...(plant.flower.type_key === "dandelion" ? { type: "dandelion" as const, fulfilled: !!plant.flower.fulfilled_at } : { type: plant.flower.type_key })}
                  growthUnits={plant.flower.growth_units}
                  growthTarget={item!.growth_target}
                  bloomed={bloom}
                  size={64}
                />
                <strong>{item!.display_name}</strong>
                <span>
                  {plant.flower.fulfilled_at ? "Wish fulfilled" : bloom
                    ? "In bloom"
                    : `${plant.flower.growth_units} / ${item!.growth_target}`}
                </span>
                {plant.flower.type_key !== "peony" &&
                  (!bloom || plant.flower.type_key === "cactus") && (
                    <span className={styles.miniMarkers} aria-hidden="true">
                      <i
                        data-cared={
                          state.member_id === 1
                            ? plant.member1_submitted
                            : plant.member2_submitted
                        }
                      />
                      <i
                        data-cared={
                          state.member_id === 1
                            ? plant.member2_submitted
                            : plant.member1_submitted
                        }
                      />
                    </span>
                  )}
              </>
            ) : (
              <>
                <span className={styles.emptyMark} aria-hidden="true">
                  +
                </span>
              </>
            )}
          </button>
        }
      >
        {open &&
          (!picking && plant ? (
            <FlowerSheet
              {...{ plant, state, item: item!, now, busy, mutate }}
            />
          ) : (
            <SeedPicker
              {...{ state, spot, busy, mutate }}
              onPlanted={() => setOpen(false)}
            />
          ))}
      </BottomSheet>
    </div>
  );
}
export function GardenClient({ initial, guideEnabled = true }: { initial: GardenResult; guideEnabled?: boolean }) {
  const [openSpot, setOpenSpot] = useState<number | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusGarden = useCallback(() => heading.current?.focus(), []);
  const { state, now, error, connected, busy, refresh, mutate } =
    useGarden(initial);
  if (!state)
    return (
      <section className="auth-card">
        <h1>Your garden is taking a moment</h1>
        <p role="alert">{error ?? "Loading your shared garden…"}</p>
        <button
          className="button button-primary"
          onClick={() => void refresh()}
        >
          Try again
        </button>
      </section>
    );
  const remaining = Math.max(0, Date.parse(state.next_rollover_at) - now);
  const hours = Math.floor(remaining / 3600000),
    minutes = Math.floor(remaining / 60000) % 60;
  const blooms = state.plants.filter((p) => p.flower.first_bloom_at).length;
  const slots = new Map(
    state.plants.map((plant) => [plant.flower.spot, plant]),
  );
  const catalog = new Map(state.catalog.map((item) => [item.type_key, item]));
  return (
    <div className={styles.garden}>
      <header className={styles.hud}>
        <h1 ref={heading} tabIndex={-1}>Our shared garden</h1>
        <div className={styles.clock} aria-label="Garden day">
          <span>Pacific garden clock · <strong suppressHydrationWarning>{pacificTime(now)}</strong></span>
          <span>{remaining > 0 ? `${hours}h ${minutes}m until a new day` : "Refreshing the new garden day…"}</span>
        </div>
      </header>
      <div className={styles.tools}>
        <details className={styles.help}>
          <summary>Garden help</summary>
          <div>
            <p>Tap a flower to care for it, or an empty patch to plant.</p>
            <p>{state.plants.length} planted · {blooms} in bloom. New beds appear as the garden fills.</p>
            <p>Garden day · {state.garden_day}. A new day starts at 4 a.m. Pacific.</p>
            <p>{state.moonflower_open ? "Moonflower is open" : "Moonflower opens at 10 p.m."}</p>
            <p>Care dots: you on the left, partner on the right. Filled dots mean cared for today.</p>
            <p>{connected ? "Growing together · live" : "Checking for shared updates"}</p>
            <button type="button" className={styles.refreshButton} onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
        </details>
        <Link href="/garden/songs" scroll={false} aria-label="Our song collection">Songs</Link>
      </div>
      <div className={styles.guide}><GardenGuide state={state} paused={busy || !!error} visit={setOpenSpot} actionOpen={openSpot !== null} enabled={guideEnabled} focusGarden={focusGarden} /></div>
      <div className={styles.workspace}>
        <section className={styles.beds} aria-label="Your flower beds">
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          {Array.from({ length: state.garden.spot_capacity / 12 }, (_, bed) => (
            <section
              key={bed}
              className={styles.bed}
              aria-label={`Garden bed ${bed + 1}`}
            >
              <div className={styles.bedTitle}>
                <span>BED {String(bed + 1).padStart(2, "0")}</span>
              </div>
              <div className={styles.path} aria-hidden="true" />
              <div className={styles.bedGrass} aria-hidden="true">
                ┐ └ &nbsp; ┘ ┌ &nbsp; └ ┘
              </div>
              {Array.from({ length: 12 }, (_, index) => {
                const spot = bed * 12 + index + 1;
                const plant = slots.get(spot);
                return (
                  <GardenSpot
                    key={spot}
                    open={openSpot === spot}
                    setOpen={(open) => setOpenSpot(open ? spot : null)}
                    {...{
                      spot,
                      plant,
                      item: plant
                        ? catalog.get(plant.flower.type_key)
                        : undefined,
                      state,
                      now,
                      busy,
                      mutate,
                    }}
                  />
                );
              })}
            </section>
          ))}
        </section>
      </div>
    </div>
  );
}
