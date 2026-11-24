"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import type { FlowerLayer } from "@/components/world/flowers/flower-layer";
import { worldFlowerAnchors, type WorldFlower } from "@/components/world/flowers/flower-models";
import { FireworksOverlay } from "@/components/world/fireworks/fireworks-overlay";
import { GardenWorld, usePrefersReducedMotion, type WorldCaption, type WorldStatus } from "@/components/world/garden-world";
import { handFont } from "@/components/world/hand-font";
import { legacyPath } from "@/lib/legacy/routes";
import { diffAway, hasAwayNews, noAwayNews, readAwaySnapshot, takeAwaySnapshot, writeAwaySnapshot, type AwayNews } from "@/lib/garden-v2/away";
import { captionName, catalogItem, gardenCareStatus, gardenDayLabel, plantSpec, stageWords } from "@/lib/garden-v2/flowers";
import { emptySpots, type GardenResult, type GardenState, type Plant } from "@/lib/garden-v2/model";
import { useGardenV2 } from "@/lib/garden-v2/use-garden-v2";
import type { FocusTarget } from "@/lib/world/journey";
import { spotPosition } from "@/lib/world/layout";
import { AwayNote } from "./away-note";
import { FlowerPanel } from "./flower-panel";
import { useNightFireworks } from "./night-fireworks";
import { PlantView } from "./plant-view";
import { SplitView } from "./split-view";
import styles from "./garden-v2.module.css";

/** How long the camera glides toward a flower before its view opens. */
export const GLIDE_MS = 950;
export const GARDEN_PATH = "/garden";
const flowerHref = (id: string) => `${GARDEN_PATH}?flower=${encodeURIComponent(id)}`;
const themeStyle = { "--hand": handFont.style.fontFamily } as CSSProperties;

type Mode = { kind: "idle" } | { kind: "flower"; id: string } | { kind: "plant"; spot: number };

function useWorldFlowers(state: GardenState | null) {
  const flowers = useMemo<WorldFlower[]>(
    () =>
      state?.plants.map((plant) => ({
        id: plant.flower.id,
        spec: plantSpec(plant, catalogItem(state, plant.flower.type_key)),
        position: spotPosition(plant.flower.spot).position,
      })) ?? [],
    [state],
  );
  const anchors = useMemo(() => worldFlowerAnchors(flowers), [flowers]);
  return { flowers, anchors };
}

/** Where keyboard focus goes back to: the flower's words in the world, else the world itself. */
function focusCaption(id: string) {
  const element = document.querySelector<HTMLElement>(`[data-caption="${CSS.escape(id)}"]`);
  if (element) element.focus();
  if (document.activeElement !== element) document.querySelector<HTMLElement>("[data-garden-world]")?.focus();
}

/**
 * The new garden: a full-screen painted world fed by the v2 state and its
 * Realtime channel. Empty seed marks plant any flower; tapping a flower (or its
 * floating name) glides the camera to it and opens the split view.
 */
export function GardenV2({ initial, initialFlowerId = null }: { initial: GardenResult; initialFlowerId?: string | null }) {
  const { state, now, error, busy, mutate } = useGardenV2(initial);
  const partner = usePartnerName();
  const reducedMotion = usePrefersReducedMotion();
  const [worldStatus, setWorldStatus] = useState<WorldStatus>("loading");
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const [news, setNews] = useState<AwayNews>(noAwayNews);
  const [wandered, setWandered] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const returnTo = useRef<string | null>(null);
  const visitSpot = useRef<number | null>(null);
  // The flower layer (GPU code and shaders) loads with the world, not in the page's first bundle.
  const [flowerLayer, setFlowerLayer] = useState<FlowerLayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/components/world/flowers/flower-layer").then(({ createFlowerLayer }) => {
      if (!cancelled) setFlowerLayer(createFlowerLayer());
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const { flowers, anchors } = useWorldFlowers(state);
  useEffect(() => flowerLayer?.setFlowers(flowers), [flowerLayer, flowers]);
  const covered = mode.kind !== "idle";
  // Night fireworks after a day with an achievement (#184); they pause with the world behind the split view.
  const fireworks = useNightFireworks({ state, now, covered, worldReady: worldStatus === "ready", reducedMotion });
  const layers = useMemo(() => [flowerLayer, fireworks.layer].filter((layer) => layer !== null), [flowerLayer, fireworks.layer]);
  const occupied = useMemo(() => state?.plants.map((plant) => plant.flower.spot) ?? [], [state]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Glides the camera to `target`, then runs `then` (at once without motion or a painted world). */
  const glide = useCallback(
    (target: FocusTarget, then: () => void, immediate = false) => {
      window.clearTimeout(timer.current);
      setFocus(target);
      if (immediate || reducedMotion || worldStatus !== "ready") then();
      else timer.current = window.setTimeout(then, GLIDE_MS);
    },
    [reducedMotion, worldStatus],
  );

  const visit = useCallback(
    (id: string, immediate = false) => {
      const anchor = anchors.find((candidate) => candidate.id === id);
      if (!anchor) return;
      returnTo.current = `flower-${id}`;
      setMode({ kind: "idle" });
      setWandered(true);
      window.history.replaceState(window.history.state, "", flowerHref(id));
      glide({ position: anchor.position, height: anchor.height ?? 0.8 }, () => setMode({ kind: "flower", id }), immediate);
    },
    [anchors, glide],
  );

  const startPlant = useCallback(
    (spot: number) => {
      returnTo.current = "plant";
      setMode({ kind: "idle" });
      setWandered(true);
      glide({ position: spotPosition(spot).position, height: 0.7 }, () => setMode({ kind: "plant", spot }));
    },
    [glide],
  );

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setMode({ kind: "idle" });
    setFocus(null);
    window.history.replaceState(window.history.state, "", GARDEN_PATH);
  }, []);

  // Deep link: /garden?flower=<id> opens that flower once.
  const deepLink = useRef(initialFlowerId);
  useEffect(() => {
    const id = deepLink.current;
    if (!id || !anchors.some((anchor) => anchor.id === id)) return;
    deepLink.current = null;
    // Arriving by link opens the flower straight away; the camera settles behind it.
    visit(id, true);
  }, [anchors, visit]);

  // After planting, glide to the new flower so today's care is one tap away.
  useEffect(() => {
    const spot = visitSpot.current;
    const planted = spot === null ? undefined : state?.plants.find((plant) => plant.flower.spot === spot);
    if (!planted || !anchors.some((anchor) => anchor.id === planted.flower.id)) return;
    visitSpot.current = null;
    visit(planted.flower.id);
  }, [state, anchors, visit]);

  // While you were away: compare once with this browser's last snapshot, then keep it current.
  const awayChecked = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (!awayChecked.current) {
      awayChecked.current = true;
      const stored = readAwaySnapshot(state.member_id);
      if (stored.ok) {
        const found = diffAway(stored.snapshot, state);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after hydration
        if (hasAwayNews(found)) setNews(found);
      }
    }
    writeAwaySnapshot(state.member_id, takeAwaySnapshot(state));
  }, [state]);

  const captions = useMemo<WorldCaption[]>(() => {
    if (!state) return [];
    const list: WorldCaption[] = [{ id: "title", text: "our garden", position: [0, 10, -62], size: "title" }];
    for (const plant of state.plants) {
      const anchor = anchors.find((candidate) => candidate.id === plant.flower.id);
      if (!anchor) continue;
      const item = catalogItem(state, plant.flower.type_key);
      const status = gardenCareStatus(plant, item, state);
      const name = captionName(item, plant.flower.type_key);
      const waiting = status?.cue === "partner-cared";
      // eslint-disable-next-line react-hooks/refs -- onSelect runs only from a click, never during render
      list.push({
        id: `flower-${plant.flower.id}`,
        text: waiting ? `${name} ♡` : name,
        position: [anchor.position[0], anchor.position[1] + (anchor.height ?? 0.8) + 0.12, anchor.position[2]],
        href: flowerHref(plant.flower.id),
        onSelect: () => visit(plant.flower.id),
        ariaLabel: flowerLabel(plant, state, partner.short),
        tone: status?.dueForYou ? undefined : "quiet",
        fadeBeyond: 6.4,
      });
    }
    const spot = emptySpots(state)[0];
    if (spot !== undefined) {
      const position = spotPosition(spot).position;
      const first = state.plants.length === 0;
      // eslint-disable-next-line react-hooks/refs -- onSelect runs only from a click, never during render
      list.push({
        id: "plant",
        text: first ? "tap a glowing seed to plant" : "plant a seed",
        position: [position[0], position[1] + (first ? 0.9 : 0.45), position[2]],
        onSelect: () => startPlant(spot),
        ariaLabel: `Plant a seed in spot ${spot}`,
        tone: first ? undefined : "quiet",
        ...(first ? {} : { fadeBeyond: 6.4 }),
      });
    }
    return list;
  }, [state, anchors, partner.short, visit, startPlant]);

  if (!state)
    return (
      <main id="main-content" className={`${styles.page} ${styles.theme} ${handFont.className}`} style={themeStyle}>
        <div className={styles.unavailable} role="alert">
          <p className={styles.title}>The garden couldn’t load.</p>
          <p>{error ?? "Check your connection and try again."}</p>
          <button type="button" className={styles.secondary} onClick={() => window.location.reload()}>
            try again
          </button>
        </div>
      </main>
    );

  const openPlant = mode.kind === "flower" ? state.plants.find((plant) => plant.flower.id === mode.id) : undefined;
  const openItem = openPlant ? catalogItem(state, openPlant.flower.type_key) : undefined;
  const openName = openPlant ? captionName(openItem, openPlant.flower.type_key) : "";

  return (
    <main
      id="main-content"
      className={`${styles.page} ${styles.theme} ${handFont.className}`}
      style={themeStyle}
      data-covered={covered || undefined}
      data-fireworks={fireworks.overlay.playing || undefined}
      onPointerDown={() => setWandered(true)}
      onWheel={() => setWandered(true)}
      onKeyDown={() => setWandered(true)}
    >
      <h1 className={styles.srOnly}>Our garden</h1>
      <GardenWorld
        className={styles.world}
        spotCapacity={state.garden.spot_capacity}
        occupiedSpots={occupied}
        flowers={anchors}
        layers={layers}
        captions={captions}
        focus={focus}
        paused={covered}
        onStatusChange={setWorldStatus}
        onPickFlower={visit}
        onPickSpot={startPlant}
        label={`Our painted garden by the lake, with ${state.plants.length} ${state.plants.length === 1 ? "flower" : "flowers"}`}
      />
      <nav className={styles.corner} aria-label="Leave the garden">
        <Link href="/">home</Link>
        <Link href={legacyPath}>old garden</Link>
      </nav>
      <FireworksOverlay {...fireworks.overlay} hidden={covered} />
      {worldStatus === "ready" && !wandered && !covered && (
        <p className={styles.hint}>scroll to wander closer · tap a flower to visit</p>
      )}
      {/* The away note waits for the fireworks to finish, so their words never overlap. */}
      {!covered && !fireworks.overlay.playing && hasAwayNews(news) && <AwayNote news={news} state={state} onDismiss={() => setNews(noAwayNews)} />}
      {error && !covered && (
        <p className={styles.toast} role="status">
          {error}
        </p>
      )}
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
      {openPlant && openItem && (
        <SplitView
          open
          onClose={close}
          spec={plantSpec(openPlant, openItem)}
          heroLabel={`The ${openName}, ${stageWords(openPlant, openItem)}`}
          heroName={openName}
          heroStage={stageWords(openPlant, openItem)}
          title={openName}
          subtitle={`planted by ${openPlant.flower.planted_by === state.member_id ? "you" : partner.short} · ${gardenDayLabel(openPlant.flower.planted_day)}`}
          onReturnFocus={() => focusCaption(returnTo.current ?? "")}
        >
          <FlowerPanel
            key={openPlant.flower.id}
            plant={openPlant}
            state={state}
            item={openItem}
            now={now}
            busy={busy}
            mutate={mutate}
            onVisit={visit}
          />
        </SplitView>
      )}
      <PlantView
        spot={mode.kind === "plant" ? mode.spot : null}
        state={state}
        busy={busy}
        mutate={mutate}
        onClose={close}
        onReturnFocus={() => focusCaption(returnTo.current ?? "")}
        onPlanted={(result, spot) => {
          const planted = result.state?.plants.find((plant) => plant.flower.spot === spot);
          const name = planted ? captionName(catalogItem(result.state!, planted.flower.type_key), planted.flower.type_key) : "flower";
          setAnnouncement(`The ${name} is planted.`);
          setMode({ kind: "idle" });
          visitSpot.current = spot;
        }}
      />
    </main>
  );
}

/** The accessible name of a flower's floating words. */
export function flowerLabel(plant: Plant, state: GardenState, partner: string) {
  const item = catalogItem(state, plant.flower.type_key);
  const name = item?.display_name ?? plant.flower.type_key;
  const growth = plant.flower.first_bloom_at
    ? stageWords(plant, item)
    : `${stageWords(plant, item)}, ${Math.min(plant.flower.growth_units, item?.growth_target ?? 0)} of ${item?.growth_target ?? "?"}`;
  const status = gardenCareStatus(plant, item, state);
  const care = !status
    ? ""
    : `. ${status.you ? "You cared today" : status.later ? "Opens at 10 p.m." : "Your care is open"}; ${partner} ${status.partner ? "cared today" : "has not yet"}`;
  return `${name}, ${growth}${care}`;
}
