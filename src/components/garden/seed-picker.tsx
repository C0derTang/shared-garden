"use client";
import { useRef, useState } from "react";
import { FlowerSprite, type FlowerType } from "./flower-sprite";
import {
  seedAvailability,
  type GardenResult,
  type GardenState,
} from "@/lib/garden/model";
import styles from "./garden.module.css";

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
  return (
    <div className={styles.stack} aria-busy={pending}>
      <p className={styles.quiet}>
        Spot {spot} · Choose a little thing to grow together.
      </p>
      <div className={styles.seeds}>
        {state.catalog.map((seed) => {
          const availability = seedAvailability(seed, state);
          return (
            <button
              key={seed.type_key}
              className={styles.seed}
              type="button"
              disabled={!availability.available || busy || pending || occupied}
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
              <span>
                <strong>{seed.display_name}</strong>
                <span>{seed.action_label}</span>
                <span>
                  {seed.growth_target}{" "}
                  {seed.type_key === "peony" ? "milestones" : "growth units"} to
                  bloom
                </span>
                <small>{availability.reason}</small>
                {["sunflower", "bluebell"].includes(seed.type_key) && (
                  <small>
                    Planting is available when unlocked; its special care is
                    coming soon.
                  </small>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {selected === "dandelion" && (
        <label className={styles.field}>
          One shared wish
          <textarea
            aria-label="One shared wish"
            value={wish}
            onChange={(e) => setWish(e.target.value)}
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
      <button
        className="button button-primary"
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
  );
}
