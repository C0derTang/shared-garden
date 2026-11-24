"use client";

import { useEffect, useMemo, useState } from "react";
import { FLOWER_TYPES } from "@/lib/world/flowers/generate";
import { bedAt, bedCountFor, spotCapacityFor, spotPosition } from "@/lib/world/layout";
import { SKY_PRESETS, type SkyPreset } from "@/lib/world/sky-presets";
import { skyStateAt } from "@/lib/world/solar";
import { GardenWorld, type WorldCaption } from "../garden-world";
import { createFlowerLayer } from "../flowers/flower-layer";
import { worldFlowerAnchors, type WorldFlower } from "../flowers/flower-models";
import styles from "./world-showcase.module.css";

const INITIAL_PLANTED = Array.from({ length: 13 }, (_, i) => i + 1);
const STAGES = { seedling: 0.15, bud: 0.38, opening: 0.72, bloom: 1 } as const;
type StageChoice = keyof typeof STAGES | "mixed";

/** Demo flowers: every type in turn, a stable seed per spot. */
function demoFlower(spot: number, stage: StageChoice): WorldFlower {
  const type = FLOWER_TYPES[(spot - 1) % FLOWER_TYPES.length]!;
  const mixed = [1, 1, 0.72, 1, 0.38, 1, 0.15, 1][spot % 8]!;
  return {
    id: `flower-${spot}`,
    spec: { type, seed: spot * 104_729 + 7, growth: stage === "mixed" ? mixed : STAGES[stage] },
    position: spotPosition(spot).position,
  };
}

/** Dev-only story page for the painted world. */
export function WorldShowcase({ preset: initialPreset, planted: initialPlanted }: { preset: SkyPreset; planted?: number }) {
  const [preset, setPreset] = useState<SkyPreset>(initialPreset);
  const [occupied, setOccupied] = useState<number[]>(() =>
    initialPlanted === undefined ? INITIAL_PLANTED : Array.from({ length: initialPlanted }, (_, i) => i + 1),
  );
  const [log, setLog] = useState<string[]>([]);
  const [stage, setStage] = useState<StageChoice>("bloom");

  const time = useMemo(() => (preset === "live" ? undefined : new Date(SKY_PRESETS[preset])), [preset]);
  const capacity = spotCapacityFor(occupied);
  const planted = useMemo(() => occupied.map((spot) => demoFlower(spot, stage)), [occupied, stage]);
  const flowers = useMemo(() => worldFlowerAnchors(planted), [planted]);
  const [flowerLayer] = useState(() => createFlowerLayer());
  useEffect(() => flowerLayer.setFlowers(planted), [flowerLayer, planted]);
  const layers = useMemo(() => [flowerLayer], [flowerLayer]);
  const sky = skyStateAt(time ?? new Date());
  const captions: WorldCaption[] = useMemo(() => {
    const list: WorldCaption[] = [{ id: "title", text: "our little garden", position: [0, 13, -70], size: "title" }];
    for (let b = 0; b < bedCountFor(capacity); b += 1) {
      const bed = bedAt(b);
      list.push({
        id: `bed-${b}`,
        text: `bed ${b + 1}`,
        position: [bed.center[0], bed.center[1] + 1.25, bed.center[2]],
        onSelect: () => setLog((previous) => [`selected bed ${b + 1}`, ...previous].slice(0, 6)),
      });
    }
    return list;
  }, [capacity]);

  const record = (line: string) => setLog((previous) => [line, ...previous].slice(0, 6));

  return (
    <div className={styles.page}>
      <GardenWorld
        className={styles.world}
        time={time}
        spotCapacity={capacity}
        occupiedSpots={occupied}
        flowers={flowers}
        layers={layers}
        captions={captions}
        onPickSpot={(spot) => {
          record(`picked empty spot ${spot}: planted a ${demoFlower(spot, stage).spec.type}`);
          setOccupied((previous) => [...previous, spot]);
        }}
        onPickFlower={(id) => record(`picked ${id}`)}
      />
      <aside className={styles.panel} aria-label="World showcase controls">
        <p className={styles.heading}>Painted world · dev showcase</p>
        <p>Scroll, swipe or use arrow keys to walk in. Click a seed mark to plant the next flower type.</p>
        <div className={styles.row} role="group" aria-label="Sky time">
          {(["dawn", "morning", "day", "dusk", "night", "live"] as const).map((name) => (
            <button key={name} type="button" aria-pressed={preset === name} onClick={() => setPreset(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className={styles.row} role="group" aria-label="Growth stage">
          {(["seedling", "bud", "opening", "bloom", "mixed"] as const).map((name) => (
            <button key={name} type="button" aria-pressed={stage === name} onClick={() => setStage(name)}>
              {name}
            </button>
          ))}
        </div>
        <p data-testid="sky-state">
          {sky.phase} · sun {sky.elevation.toFixed(1)}° · azimuth {sky.azimuth.toFixed(0)}°
        </p>
        <p>
          {occupied.length} planted · {capacity} spots ({capacity / 12} beds)
        </p>
        <div className={styles.row}>
          <button
            type="button"
            onClick={() => {
              const taken = new Set(occupied);
              let spot = 1;
              while (taken.has(spot)) spot += 1;
              setOccupied([...occupied, spot]);
            }}
          >
            plant next
          </button>
          <button type="button" onClick={() => setOccupied([])}>
            clear
          </button>
        </div>
        <ol className={styles.log} aria-live="polite">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
