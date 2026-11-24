"use client";

import { useMemo, useRef, useState } from "react";
import type { FlowerType } from "@/lib/garden-v2/model";
import { FLOWER_TYPES, flowerPhase, type FlowerSpec, type PlacedFlower } from "@/lib/world/flowers/generate";
import { SKY_PRESETS } from "@/lib/world/sky-presets";
import { FlowerHero, type HeroFraming } from "./flower-hero";
import { flowerModel } from "./flower-models";
import type { StudioState } from "./studio-renderer";
import { usePrefersReducedMotion, useStudio } from "./use-studio";
import styles from "./flower-gallery.module.css";

export type GalleryView = "stages" | "seeds" | "type" | "hero";
type Sky = "day" | "dusk" | "night";

const STAGES = [
  { name: "seedling", growth: 0.15 },
  { name: "bud", growth: 0.38 },
  { name: "opening", growth: 0.72 },
  { name: "bloom", growth: 1 },
] as const;
const SEEDS = [1, 2_024_117, 9_007_199_254_740_991, 48_271_337];
/** Sample hydrangea mood colours (calm, tender, low). */
const MOODS = ["#6f9eab", "#d88798", "#8b87ab"];

interface Cell {
  readonly spec: FlowerSpec;
  /** Plant that sets the cell's scale (the same plant in bloom), so stages compare. */
  readonly sizeSpec: FlowerSpec;
}

function gridFor(view: GalleryView, type: FlowerType, seed: number): { columns: string[]; rows: string[]; cells: Cell[][] } {
  if (view === "seeds") {
    return {
      columns: [...FLOWER_TYPES],
      rows: SEEDS.map((s) => `seed ${s}`),
      cells: SEEDS.map((s) => FLOWER_TYPES.map((t) => ({ spec: { type: t, seed: s, growth: 1 }, sizeSpec: { type: t, seed: s, growth: 1 } }))),
    };
  }
  if (view === "type") {
    const stages: { name: string; spec: (s: number) => FlowerSpec }[] = STAGES.map((stage) => ({ name: stage.name, spec: (s) => ({ type, seed: s, growth: stage.growth }) }));
    if (type === "dandelion") stages.push({ name: "seed puff", spec: (s) => ({ type, seed: s, growth: 1, puff: true }) });
    if (type === "hydrangea") stages.push({ name: "mood colours", spec: (s) => ({ type, seed: s, growth: 1, moodColors: MOODS }) });
    return {
      columns: stages.map((s) => s.name),
      rows: SEEDS.map((s) => `seed ${s}`),
      cells: SEEDS.map((s) => stages.map((stage) => ({ spec: stage.spec(s), sizeSpec: { type, seed: s, growth: 1 } }))),
    };
  }
  return {
    columns: [...FLOWER_TYPES],
    rows: STAGES.map((s) => s.name),
    cells: STAGES.map((stage) => FLOWER_TYPES.map((t) => ({ spec: { type: t, seed, growth: stage.growth }, sizeSpec: { type: t, seed, growth: 1 } }))),
  };
}

/** Cell width relative to its height (plants are tall). */
const CELL_WIDTH = 0.56;

/** Lays the plants out on a plate: cells one unit tall, bases near each cell's foot. */
function placeGrid(cells: Cell[][]): PlacedFlower[] {
  const rows = cells.length;
  const cols = cells[0]?.length ?? 1;
  const placed: PlacedFlower[] = [];
  cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      const bloom = flowerModel(cell.sizeSpec);
      const scale = Math.min(0.84 / Math.max(bloom.height, 0.1), (CELL_WIDTH * 0.46) / Math.max(bloom.radius, 0.05));
      placed.push({
        model: flowerModel(cell.spec),
        placement: { position: [(c - (cols - 1) / 2) * CELL_WIDTH, (rows - 1) / 2 - r - 0.45, 0], yaw: 0, scale },
        phase: flowerPhase(cell.spec.seed),
      });
    });
  });
  return placed;
}

function Plate({ cells, columns, rows, sky }: { cells: Cell[][]; columns: string[]; rows: string[]; sky: Sky }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const state: StudioState = useMemo(
    () => ({
      flowers: placeGrid(cells),
      camera: { kind: "plate", center: [0, 0, 0], halfHeight: rows.length / 2, elevation: 0.12 },
      time: new Date(SKY_PRESETS[sky]),
      reducedMotion,
      aura: 0.18,
      sway: 0.4,
    }),
    [cells, rows.length, sky, reducedMotion],
  );
  const status = useStudio(canvasRef, state);
  return (
    <div className={styles.plate} style={{ gridTemplateColumns: `7rem repeat(${columns.length}, minmax(0, 1fr))` }}>
      <span />
      {columns.map((name) => (
        <span key={name} className={styles.column}>
          {name}
        </span>
      ))}
      <div className={styles.rowLabels} style={{ gridRow: `2 / span 1` }}>
        {rows.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className={styles.canvasWrap} style={{ gridColumn: `2 / span ${columns.length}`, aspectRatio: `${columns.length * CELL_WIDTH} / ${rows.length}` }} data-status={status}>
        {status === "unsupported" ? <p className={styles.notice}>WebGPU is required to paint the flowers.</p> : <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label="Procedural flower plate" />}
      </div>
    </div>
  );
}

/** Development-only gallery of the procedural flowers (types × seeds × stages, and the hero mode). */
export function FlowerGallery({
  initialView,
  initialType,
  initialSeed,
  initialSky,
  initialFraming = "plant",
}: {
  initialView: GalleryView;
  initialType: FlowerType;
  initialSeed: number;
  initialSky: Sky;
  initialFraming?: HeroFraming;
}) {
  const [view, setView] = useState<GalleryView>(initialView);
  const [type, setType] = useState<FlowerType>(initialType);
  const [seed, setSeed] = useState(initialSeed);
  const [sky, setSky] = useState<Sky>(initialSky);
  const [growth, setGrowth] = useState(1);
  const [framing, setFraming] = useState<HeroFraming>(initialFraming);
  const grid = useMemo(() => gridFor(view, type, seed), [view, type, seed]);

  return (
    <main className={styles.page}>
      <header className={styles.controls}>
        <strong>Procedural flowers · dev gallery</strong>
        <div className={styles.row} role="group" aria-label="View">
          {(["stages", "seeds", "type", "hero"] as const).map((name) => (
            <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className={styles.row} role="group" aria-label="Light">
          {(["day", "dusk", "night"] as const).map((name) => (
            <button key={name} type="button" aria-pressed={sky === name} onClick={() => setSky(name)}>
              {name}
            </button>
          ))}
        </div>
        <label>
          type{" "}
          <select value={type} onChange={(event) => setType(event.target.value as FlowerType)}>
            {FLOWER_TYPES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          seed <input type="number" value={seed} min={0} onChange={(event) => setSeed(Math.max(0, Math.trunc(Number(event.target.value) || 0)))} />
        </label>
        <button type="button" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 52))}>
          random seed
        </button>
        {view === "hero" ? (
          <label>
            growth <input type="range" min={0} max={1} step={0.01} value={growth} onChange={(event) => setGrowth(Number(event.target.value))} /> {growth.toFixed(2)}
          </label>
        ) : null}
        {view === "hero" ? (
          <div className={styles.row} role="group" aria-label="Framing">
            {(["plant", "bloom"] as const).map((name) => (
              <button key={name} type="button" aria-pressed={framing === name} onClick={() => setFraming(name)}>
                {name}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {view === "hero" ? (
        <section className={styles.split}>
          <FlowerHero className={styles.hero} framing={framing} spec={{ type, seed, growth, moodColors: type === "hydrangea" ? MOODS : undefined }} time={new Date(SKY_PRESETS[sky])} />
          <div className={styles.details}>
            <p className={styles.detailTitle}>{type}</p>
            <p>seed {seed} · growth {Math.round(growth * 100)}%</p>
            <p>Hero render mode: one flower large and lit, slowly turning, with its aura. The right half is where the flower&apos;s activity and details will sit.</p>
          </div>
        </section>
      ) : (
        <Plate cells={grid.cells} columns={grid.columns} rows={grid.rows} sky={sky} />
      )}
    </main>
  );
}
