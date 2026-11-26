"use client";
import { useId, useRef, useState, type FormEvent } from "react";
import { characters } from "@/lib/garden/entry-draft";
import { previewSeed } from "@/lib/garden-v2/flowers";
import type { FlowerType, GardenResult, GardenState } from "@/lib/garden-v2/model";
import type { MutateV2 } from "./care-form";
import { SplitView } from "./split-view";
import styles from "./garden-v2.module.css";

export const WISH_LIMIT = 500;

/** One line about each flower's daily activity, in the garden's voice. */
const ABOUT: Record<FlowerType, string> = {
  rose: "a little note about your day",
  cactus: "a one-tap “I’m here” check-in",
  tulip: "share a song for today",
  marigold: "a compliment or something you appreciate",
  daisy: "answer the question of the day",
  hydrangea: "choose a mood color; it tints the blooms",
  sunflower: "share a photo",
  snapdragon: "an honest check-in",
  moonflower: "a late-night thought, 10 p.m.–4 a.m.",
  bluebell: "leave a voice memo",
  dandelion: "make a wish together, then add to it",
  "forget-me-not": "a memory you share",
  peony: "four milestones, together",
};

/**
 * Planting on an empty spot: any of the 13 flowers, any number of each. The
 * selected flower is painted on the left as it will look in bloom (each real
 * seed grows its own way). A Dandelion asks for its shared wish first.
 */
export function PlantView({
  spot,
  initialType = "rose",
  state,
  busy,
  mutate,
  onClose,
  onPlanted,
  onReturnFocus,
}: {
  spot: number | null;
  initialType?: FlowerType;
  state: GardenState;
  busy: boolean;
  mutate: MutateV2;
  onClose: () => void;
  /** Called with the fresh state after a successful planting. */
  onPlanted: (result: GardenResult, spot: number) => void;
  onReturnFocus?: () => void;
}) {
  const id = useId();
  const [type, setType] = useState<FlowerType>(initialType);
  const [wish, setWish] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const item = state.catalog.find((entry) => entry.type_key === type);
  const wishValid = type !== "dandelion" || (wish.trim().length > 0 && characters(wish.trim()) <= WISH_LIMIT);

  async function plant(event: FormEvent) {
    event.preventDefault();
    if (spot === null || !wishValid || lock.current || busy) return;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await mutate({ kind: "plant", type, spot, ...(type === "dandelion" ? { wish: wish.trim() } : {}) });
      if (result.saved) {
        setWish("");
        onPlanted(result, spot);
      } else setError(result.error ?? "That seed could not be planted. Try again.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  const name = (item?.display_name ?? type).toLowerCase();
  return (
    <SplitView
      open={spot !== null}
      onClose={onClose}
      spec={{ type, seed: previewSeed(type), growth: 1 }}
      heroLabel={`A ${name} in bloom, as this seed could grow`}
      heroName={name}
      heroStage="in bloom, someday"
      title="plant a seed"
      subtitle={`in the ${name} area · every seed grows its own way`}
      onReturnFocus={onReturnFocus}
      closeLabel="Close without planting"
    >
      <form className={styles.panelBody} onSubmit={(event) => void plant(event)} aria-busy={pending}>
        <fieldset className={styles.seeds}>
          <legend className={styles.sectionTitle}>which flower?</legend>
          <div className={styles.seedList}>
            {state.catalog.map((entry) => (
              <label key={entry.type_key} className={styles.seed} data-chosen={entry.type_key === type || undefined}>
                <input
                  type="radio"
                  name={`${id}-type`}
                  value={entry.type_key}
                  checked={entry.type_key === type}
                  onChange={() => {
                    setType(entry.type_key);
                    setError(null);
                  }}
                />
                <span className={styles.seedName}>{entry.display_name.toLowerCase()}</span>
                <span className={styles.seedAbout}>
                  {ABOUT[entry.type_key]}
                  {" · "}blooms after {entry.growth_target} {entry.type_key === "peony" ? "milestones" : "shared days"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {type === "dandelion" && (
          <div className={styles.field}>
            <label className={styles.fieldLabel}>
              <span>Your shared wish</span>
              <textarea
                rows={3}
                required
                value={wish}
                maxLength={WISH_LIMIT * 2}
                onChange={(event) => setWish(event.target.value)}
                aria-describedby={`${id}-wish`}
              />
            </label>
            <small id={`${id}-wish`}>
              {characters(wish.trim())} / {WISH_LIMIT} · You both see it. When it comes true, blow the seeds.
            </small>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="submit" className={styles.primary} disabled={spot === null || !wishValid || busy || pending}>
            {pending ? "planting…" : `plant the ${name}`}
          </button>
        </div>
      </form>
    </SplitView>
  );
}
