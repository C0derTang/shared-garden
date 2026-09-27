"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { GardenGuide } from "@/components/settings/garden-guide";
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
import { HelpDisclosure } from "./help-disclosure";
import { SeedPicker, type Mutate } from "./seed-picker";
import { SpotNotice, useSpotRequest } from "./spot-request";
import styles from "./garden.module.css";

// Short weekday and date for the clock plate, from the YYYY-MM-DD garden day.
function gardenDayLabel(day: string) {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", day: "numeric" });
  const parts = format.formatToParts(new Date(`${day}T12:00:00Z`));
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")}`;
}

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
const grassClumps = [
  [7, 8], [25, 13], [72, 9], [91, 16], [42, 20], [12, 28],
  [66, 25], [87, 33], [29, 38], [55, 43], [6, 49], [72, 53],
  [94, 59], [21, 63], [44, 68], [62, 72], [10, 78], [83, 81],
  [34, 86], [56, 90], [15, 94], [74, 96], [96, 47], [3, 70],
];
const meadowPixels = [[5, 18], [31, 6], [63, 16], [84, 27], [18, 42], [69, 39], [91, 53], [35, 58], [7, 67], [58, 76], [86, 88], [28, 93]];
function GardenScenery({ bed }: { bed: number }) {
  const variant = bed % 2;
  return (
    <div
      className={styles.gardenScenery}
      data-bed-variant={variant}
      aria-hidden="true"
    >
      {meadowPixels.map(([left, top], index) => (
        <i
          key={`pixel-${index}`}
          className={styles.meadowPatch}
          style={{ left: `${variant ? 100 - left : left}%`, top: `${top}%` }}
        />
      ))}
      {grassClumps.map(([left, top], index) => (
        <i
          key={`grass-${index}`}
          className={styles.grassClump}
          data-grass-clump=""
          style={{ left: `${left}%`, top: `${top}%` }}
        />
      ))}
    </div>
  );
}
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
  visit,
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
  visit: (spot: number) => void;
}) {
  const [picking, setPicking] = useState(!plant);
  // Set by a successful plant, which turns this sheet into the new flower's.
  const [planted, setPlanted] = useState(false);
  // Reopening after a successful plant must show the new flower’s care sheet.
  if (!open && (picking !== !plant || planted)) {
    setPicking(!plant);
    setPlanted(false);
  }
  const [x, y] = positions[(spot - 1) % 12];
  const bloom = !!plant?.flower.first_bloom_at;
  const cared = plant
    ? Number(plant.member1_submitted) + Number(plant.member2_submitted)
    : 0;
  return (
    <div
      className={styles.spot}
      data-motion-phase={spot % 4}
      style={{ left: `${x}%`, top: y }}
    >
      <BottomSheet
        open={open}
        onOpenChange={(next) => {
          if (next) setPicking(!plant);
          setOpen(next);
        }}
        title={
          !picking && item
            ? `${item.display_name}${planted ? " planted ✿" : ""}`
            : "Plant something together"
        }
        description={
          plant
            ? `${item!.action_label}. Your shared progress, today’s care, and memories.`
            : "Every seed has its own small ritual."
        }
        hideDescription={!!plant}
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
                  idle
                  size={64}
                />
                <strong className={styles.surfaceLabel} aria-hidden="true">
                  {item!.display_name}
                </strong>
                <span className={styles.surfaceLabel} aria-hidden="true">
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
            ) : <span className={styles.emptyMark} aria-hidden="true" />}
          </button>
        }
      >
        {open &&
          (!picking && plant ? (
            <FlowerSheet
              {...{ plant, state, item: item!, now, busy, mutate }}
              onVisit={visit}
              onClose={() => setOpen(false)}
            />
          ) : (
            <SeedPicker
              {...{ state, spot, busy, mutate }}
              onPlanted={() => {
                setPlanted(true);
                setPicking(false);
              }}
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
  const spotRequest = useSpotRequest(state, guideEnabled, setOpenSpot);
  if (!state)
    return (
      <div className={`${styles.garden} ${styles.fallback}`}>
        <section className={styles.fallbackCard} aria-labelledby="garden-fallback-title">
          <h1 id="garden-fallback-title">Your garden is taking a moment</h1>
          {error ? (
            <>
              <p role="alert">{error}</p>
              <button
                type="button"
                className="button button-primary"
                onClick={() => void refresh()}
              >
                Try again
              </button>
            </>
          ) : (
            <p role="status">Loading cc’s garden…</p>
          )}
        </section>
      </div>
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
        <h1 ref={heading} tabIndex={-1}>cc’s garden</h1>
        <div className={styles.clock} aria-label="Garden day">
          <span className={styles.clockDay}>
            {/* Moon during the Moonflower night (10 p.m.–4 a.m. Pacific), sun otherwise. */}
            <PixelIcon name={state.moonflower_open ? "moon" : "sun"} className={styles.clockIcon} />
            {gardenDayLabel(state.garden_day)}
          </span>
          <span className={styles.clockTime}>
            <span>Pacific · <strong suppressHydrationWarning>{pacificTime(now)}</strong></span>
            <span>{remaining > 0 ? `New day in ${hours}h ${minutes}m` : "Refreshing day…"}</span>
          </span>
        </div>
      </header>
      <div className={styles.tools}>
        <HelpDisclosure className={styles.help} summaryClassName={styles.chip}>
          <div>
            <p>Tap a flower to care. Tap bare soil to plant.</p>
            <p>{state.plants.length} planted · {blooms} blooms · beds grow as needed.</p>
            <p>Garden day {state.garden_day} · starts 4 a.m. Pacific.</p>
            <p>{state.moonflower_open ? "Moonflower · open until 4 a.m." : "Moonflower · 10 p.m.–4 a.m. Pacific"}</p>
            <p>Dots · you left, partner right; filled means cared today.</p>
            <p>{connected ? "Live updates on" : "Checking updates…"}</p>
            <button type="button" className={styles.refreshButton} onClick={() => void refresh()} disabled={busy}>Refresh</button>
          </div>
        </HelpDisclosure>
        <Link href="/garden/songs" scroll={false} className={styles.chip}>Songs</Link>
      </div>
      <SpotNotice {...spotRequest} />
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
              <GardenScenery bed={bed} />
              {Array.from({ length: 12 }, (_, index) => {
                const spot = bed * 12 + index + 1;
                const plant = slots.get(spot);
                return (
                  <GardenSpot
                    key={spot}
                    open={openSpot === spot}
                    setOpen={(open) => setOpenSpot(open ? spot : null)}
                    visit={setOpenSpot}
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
