"use client";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { PixelIcon } from "@/components/ui/pixel-icon";
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
}: {
  spot: number;
  plant?: Plant;
  item?: CatalogItem;
  state: GardenState;
  now: number;
  busy: boolean;
  mutate: Mutate;
}) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(!plant);
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
                ? `${item!.display_name}, spot ${spot}, ${plant.flower.fulfilled_at ? "fulfilled wish" : bloom ? "permanent bloom" : `${plant.flower.growth_units} of ${item!.growth_target} growth units`}, ${cared} of 2 cared today`
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
                {(!bloom || plant.flower.type_key === "cactus") && (
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
                <span>Plant here</span>
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
export function GardenClient({ initial }: { initial: GardenResult }) {
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
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">A LITTLE CARE, EVERY DAY</p>
          <h1>Our shared garden</h1>
          <p className={styles.quiet}>
            A place for the things we grow together.
          </p>
        </div>
        <div className={styles.gardenStats}>
          <span>
            <strong>{state.plants.length}</strong> planted
          </span>
          <span>
            <strong>{blooms}</strong> in bloom
          </span>
        </div>
      </div>
      <div className={styles.workspace}>
        <aside className={styles.almanac} aria-label="Garden day">
          <div className={styles.clock}>
            <div className={styles.clockLabel}>
              <PixelIcon name="flower" />
              <span>Pacific garden clock</span>
            </div>
            <p className={styles.clockTime} suppressHydrationWarning>
              {pacificTime(now)}
            </p>
            <p>Garden day · {state.garden_day}</p>
            <div className={styles.clockRule} />
            <strong>
              {remaining > 0
                ? `${hours}h ${minutes}m until a new day`
                : "Refreshing the new garden day…"}
            </strong>
            <p className={styles.quiet}>Your garden turns the page at 4 a.m.</p>
            <p className={styles.moon}>
              {state.moonflower_open
                ? "☾ Moonflower is open"
                : "☾ Moonflower opens at 10 p.m."}
            </p>
          </div>
          <div className={styles.gardenNote}>
            <p className="eyebrow">ROOM TO KEEP GROWING</p>
            <p>
              Choose an empty patch to plant a seed. Tap a flower to leave a
              little care.
            </p>
            <p>Blooms stay with you, and new beds appear as this one fills.</p>
            <div className={styles.legend}>
              <span>
                <i />
                You
              </span>
              <span>
                <i />
                Partner
              </span>
            </div>
            <small>Filled dots mean care is shared today.</small>
          </div>
        </aside>
        <section className={styles.beds} aria-label="Your flower beds">
          <div className={styles.syncRow}>
            <span className={styles.syncState}>
              {connected
                ? "● Growing together · live"
                : "○ Checking for shared updates"}
            </span>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void refresh()}
              disabled={busy}
            >
              Refresh
            </button>
          </div>
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
                <span aria-hidden="true">✦</span>
                <span>A little room to bloom</span>
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
          <p className={styles.bedFooter}>Small moments, taking root.</p>
        </section>
      </div>
    </div>
  );
}
