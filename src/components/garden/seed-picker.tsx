"use client";
import { useId, useRef, useState } from "react";
import { FlowerSprite, type FlowerType } from "./flower-sprite";
import {
  seedAvailability,
  type CatalogItem,
  type GardenResult,
  type GardenState,
} from "@/lib/garden/model";
import styles from "./garden.module.css";
import seedStyles from "./seed-picker.module.css";

import type { GardenMutation } from "@/lib/garden/use-garden";

export type Mutate = (command: GardenMutation) => Promise<GardenResult>;

const growthLabel = (seed: CatalogItem) =>
  `${seed.growth_target} ${seed.type_key === "peony" ? "milestones" : "growth units"} to bloom`;
// A slot shows only a sprite and name, so its accessible name carries the rest.
const seedLabel = (seed: CatalogItem, reason: string) =>
  `${seed.display_name}, ${seed.action_label}. ${growthLabel(seed)}. ${reason}`;

// Leads the empty bag with the nearest unlock, or with why nothing is free.
function nextUnlock(state: GardenState) {
  const blooms = state.plants.filter((p) => p.flower.first_bloom_at).length;
  const next = state.catalog
    .filter(
      (c) =>
        c.type_key !== "cactus" &&
        !state.unlocks.some((u) => u.type_key === c.type_key),
    )
    .sort((a, b) => a.unlock_after_blooms - b.unlock_after_blooms)[0];
  if (!next) return { seed: null, lead: "Every seed is growing right now." };
  const needed = Math.max(1, next.unlock_after_blooms - blooms);
  return {
    seed: next,
    lead: `Bloom ${needed} more flower${needed === 1 ? "" : "s"} to unlock ${next.display_name}.`,
  };
}

export function SeedPicker({
  state,
  spot,
  busy,
  mutate,
  onPlanted,
}: {
  state: GardenState;
  spot: number;
  busy: boolean;
  mutate: Mutate;
  onPlanted: () => void;
}) {
  const [selected, setSelected] = useState<FlowerType | null>(null);
  const [wish, setWish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const bagId = useId();
  const item = state.catalog.find((c) => c.type_key === selected);
  const occupied = state.plants.some((p) => p.flower.spot === spot);
  const canPlant =
    item &&
    seedAvailability(item, state).available &&
    !occupied &&
    (selected !== "dandelion" ||
      (wish.trim().length > 0 && Array.from(wish.trim()).length <= 500));
  async function plant() {
    if (!selected || !canPlant || lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await mutate({
        kind: "plant",
        type: selected,
        spot,
        ...(selected === "dandelion" ? { wish } : {}),
      });
      setError(result.error);
      if (result.saved) {
        // The same sheet becomes the new flower's sheet, so its heading is the
        // natural place for focus once this picker leaves.
        const heading = root.current
          ?.closest('[role="dialog"]')
          ?.querySelector<HTMLElement>("h2");
        onPlanted();
        if (heading) {
          heading.tabIndex = -1;
          heading.focus();
        }
      }
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const seeds = state.catalog.map((seed) => ({
    seed,
    availability: seedAvailability(seed, state),
  }));
  const available = seeds.filter((s) => s.availability.available);
  const locked = seeds.filter((s) => !s.availability.available);
  const selectedReason = item && seedAvailability(item, state).reason;
  const unlock = available.length === 0 ? nextUnlock(state) : null;
  function select(seed: CatalogItem) {
    setSelected(seed.type_key);
    setError(null);
  }
  function sprite(seed: CatalogItem) {
    return (
      <FlowerSprite
        type={seed.type_key}
        growthUnits={seed.growth_target}
        growthTarget={seed.growth_target}
        bloomed
        size={64}
      />
    );
  }
  return (
    <div ref={root} className={seedStyles.picker} aria-busy={pending}>
      <p className={styles.quiet}>
        Spot {spot} · Choose a little thing to grow together.
      </p>
      {unlock && (
        <div className={seedStyles.nextUnlock}>
          {unlock.seed && (
            <span className={seedStyles.nextSprite} aria-hidden="true">
              {sprite(unlock.seed)}
            </span>
          )}
          <p>
            <strong>{unlock.lead}</strong>
            <span>
              Nothing can be planted right now. Your growing flowers free up
              seeds as they bloom.
            </span>
          </p>
        </div>
      )}
      {available.length > 0 && (
        <section className={seedStyles.bag} aria-labelledby={bagId}>
          <h3 id={bagId} className={seedStyles.bagLabel}>
            Seed bag <span>{available.length}</span>
          </h3>
          <div className={seedStyles.slots}>
            {available.map(({ seed, availability }) => (
              <button
                key={seed.type_key}
                className={seedStyles.slot}
                type="button"
                disabled={busy || pending || occupied}
                aria-pressed={selected === seed.type_key}
                aria-label={seedLabel(seed, availability.reason)}
                onClick={() => select(seed)}
              >
                <span className={seedStyles.slotSprite}>{sprite(seed)}</span>
                <strong className={seedStyles.slotName}>
                  {seed.display_name}
                </strong>
              </button>
            ))}
          </div>
        </section>
      )}
      {available.length > 0 && (
        <div
          className={seedStyles.card}
          data-item-card=""
          data-empty={item ? undefined : ""}
        >
          {item ? (
            <>
              <span className={seedStyles.cardSprite} aria-hidden="true">
                {sprite(item)}
              </span>
              <div className={seedStyles.cardText}>
                <p className={seedStyles.cardName}>{item.display_name}</p>
                <p className={seedStyles.cardRitual}>{item.action_label}</p>
                <p className={seedStyles.cardStats}>
                  <span className={seedStyles.pips} aria-hidden="true">
                    {Array.from(
                      { length: Math.min(item.growth_target, 14) },
                      (_, i) => (
                        <i key={i} />
                      ),
                    )}
                  </span>
                  <span>{growthLabel(item)}</span>
                  <span>{selectedReason}</span>
                </p>
              </div>
            </>
          ) : (
            <p className={seedStyles.cardHint}>
              Pick a seed from your bag to see its ritual.
            </p>
          )}
        </div>
      )}
      {locked.length > 0 && (
        <details className={seedStyles.locked}>
          <summary>Still to unlock ({locked.length})</summary>
          <ul className={seedStyles.lockedList}>
            {locked.map(({ seed, availability }) => (
              <li key={seed.type_key}>
                <button
                  className={seedStyles.lockedSeed}
                  type="button"
                  disabled
                  aria-pressed={false}
                  aria-label={seedLabel(seed, availability.reason)}
                >
                  <span className={seedStyles.lockedSprite}>{sprite(seed)}</span>
                  <span className={seedStyles.lockedText}>
                    <strong>{seed.display_name}</strong>
                    <small>{availability.reason}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {selected === "dandelion" && (
        <label className={styles.field}>
          One shared wish
          <textarea
            aria-label="One shared wish"
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            // Caret reveal ignores scroll margin; bring the whole field clear
            // of the sticky Plant bar.
            onFocus={(e) =>
              e.currentTarget.scrollIntoView?.({ block: "nearest" })
            }
            rows={3}
            aria-describedby="wish-limit"
          />
          <small id="wish-limit">
            1–500 characters. Each day, add a detail to this wish.
          </small>
        </label>
      )}
      {occupied && (
        <p role="status">
          Someone planted here. Close this sheet to see the flower.
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={seedStyles.footer}>
        <button
          className={`button button-primary ${seedStyles.plant}`}
          disabled={!canPlant || busy || pending}
          onClick={() => void plant()}
        >
          {pending
            ? "Planting…"
            : item
              ? `Plant ${item.display_name}`
              : "Choose a seed"}
        </button>
      </div>
    </div>
  );
}
