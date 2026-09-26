"use client";
import { useRef, useState } from "react";
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
      if (result.saved) onPlanted();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  function tile(seed: CatalogItem, reason: string, locked: boolean) {
    return (
      <button
        key={seed.type_key}
        className={seedStyles.seed}
        data-locked={locked || undefined}
        type="button"
        disabled={locked || busy || pending || occupied}
        aria-pressed={selected === seed.type_key}
        onClick={() => {
          setSelected(seed.type_key);
          setError(null);
        }}
      >
        <FlowerSprite
          type={seed.type_key}
          growthUnits={seed.growth_target}
          growthTarget={seed.growth_target}
          bloomed
          size={64}
        />
        <span className={seedStyles.text}>
          <span className={seedStyles.title}>
            <strong>{seed.display_name}</strong>
            <span>{seed.action_label}</span>
          </span>
          <small>
            {seed.growth_target}{" "}
            {seed.type_key === "peony" ? "milestones" : "growth units"} to bloom
            · {reason}
          </small>
        </span>
      </button>
    );
  }
  const seeds = state.catalog.map((seed) => ({
    seed,
    availability: seedAvailability(seed, state),
  }));
  const available = seeds.filter((s) => s.availability.available);
  const locked = seeds.filter((s) => !s.availability.available);
  return (
    <div className={seedStyles.picker} aria-busy={pending}>
      <p className={styles.quiet}>
        Spot {spot} · Choose a little thing to grow together.
      </p>
      {available.length > 0 && (
        <div className={seedStyles.seeds}>
          {available.map(({ seed, availability }) =>
            tile(seed, availability.reason, false),
          )}
        </div>
      )}
      {locked.length > 0 && (
        <details className={seedStyles.locked}>
          <summary>Still to unlock ({locked.length})</summary>
          <div className={seedStyles.seeds}>
            {locked.map(({ seed, availability }) =>
              tile(seed, availability.reason, true),
            )}
          </div>
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
