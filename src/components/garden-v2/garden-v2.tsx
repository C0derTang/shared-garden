"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { usePartnerName } from "@/components/auth/member-names";
import { useSheetScope } from "@/components/ui/sheet-scope";
import type { FlowerLayer } from "@/components/world/flowers/flower-layer";
import { worldFlowerAnchors, type WorldFlower } from "@/components/world/flowers/flower-models";
import { FireworksOverlay } from "@/components/world/fireworks/fireworks-overlay";
import { GardenWorld, usePrefersReducedMotion, type WorldCaption, type WorldStatus } from "@/components/world/garden-world";
import { handFont } from "@/components/world/hand-font";
import { legacyPath } from "@/lib/legacy/routes";
import { diffAway, hasAwayNews, noAwayNews, readAwaySnapshot, takeAwaySnapshot, writeAwaySnapshot, type AwayNews } from "@/lib/garden-v2/away";
import { captionName, catalogItem, gardenDayLabel, plantSpec, stageWords } from "@/lib/garden-v2/flowers";
import type { FlowerType, GardenResult, GardenState, Plant } from "@/lib/garden-v2/model";
import { gardenPlots, waitingOnYou, type GardenPlot } from "@/lib/garden-v2/plots";
import { useGardenV2 } from "@/lib/garden-v2/use-garden-v2";
import { gardenViewHref, type GardenView } from "@/lib/garden-v2/views";
import type { FocusTarget } from "@/lib/world/journey";
import { areaLabelPosition, typeAreaLayout, type TypeAreaLayout } from "@/lib/garden-v2/type-areas";
import { DEFAULT_FLOWER_HEIGHT, type FlowerAnchor } from "@/lib/world/picking";
import { ArrivalLight, useGardenArrival } from "./arrival";
import { AwayNote } from "./away-note";
import { FlowerPanel } from "./flower-panel";
import { useNightFireworks } from "./night-fireworks";
import { GardenOverlays } from "./overlays/garden-overlays";
import { PlantView } from "./plant-view";
import { PlotList, focusPlot } from "./plot-list";
import { useSeedBlows } from "./seed-blows";
import { SplitView } from "./split-view";
import styles from "./garden-v2.module.css";

/** How long the camera glides toward a flower before its view opens. */
export const GLIDE_MS = 950;
/**
 * Closing a Dandelion whose seeds are about to blow in the world: the camera
 * holds its close look while they lift, then glides back (#201).
 */
export const SEED_HOLD_MS = 2800;
const STILL_SEED_HOLD_MS = 1200;
export const GARDEN_PATH = "/garden";
const flowerHref = (id: string) => `${GARDEN_PATH}?flower=${encodeURIComponent(id)}`;
const themeStyle = { "--hand": handFont.style.fontFamily } as CSSProperties;

type Mode = { kind: "idle" } | { kind: "flower"; id: string } | { kind: "plant"; spot: number; type: FlowerType };

function useWorldFlowers(state: GardenState | null, layout: TypeAreaLayout | null) {
  const flowers = useMemo<WorldFlower[]>(
    () => {
      const positions = new Map(layout?.spots.map((spot) => [spot.spot, spot.position]));
      return state?.plants.map((plant) => ({
        id: plant.flower.id,
        spec: plantSpec(plant, catalogItem(state, plant.flower.type_key)),
        position: positions.get(plant.flower.spot)!,
      })) ?? [];
    },
    [state, layout],
  );
  const anchors = useMemo(() => worldFlowerAnchors(flowers), [flowers]);
  return { flowers, anchors };
}

const TITLE: readonly WorldCaption[] = [{ id: "title", text: "our garden", position: [0, 7, -62], size: "title" }];
/** How far above the top of a flower (or a sprout's shoot) its "♡" floats, in world units (#214). */
export const HEART_LIFT = 0.02;

/**
 * The small "♡" floating over each flower still waiting on your care (#214):
 * decorative, anchored just above the plant's top, so it rises as it grows.
 */
export function careHearts(waiting: readonly Plant[], anchors: readonly FlowerAnchor[]): WorldCaption[] {
  return waiting.flatMap((plant): WorldCaption[] => {
    const anchor = anchors.find((candidate) => candidate.id === plant.flower.id);
    if (!anchor) return [];
    const [x, y, z] = anchor.position;
    return [{ id: `care-${plant.flower.id}`, text: "♡", size: "mark", position: [x, y + (anchor.height ?? DEFAULT_FLOWER_HEIGHT) + HEART_LIFT, z] }];
  });
}

/**
 * The new garden: a full-screen painted world fed by the v2 state and its
 * Realtime channel. Named type areas and seed marks start planting; tapping a flower glides
 * the camera to it and opens the split view. No names float over the plants
 * (#206); a small "♡" floats over each flower still waiting on your care
 * today (#214). Keyboard and screen-reader users reach every plot through a
 * hidden plot list that shows only the focused plot's name (#210).
 */
export function GardenV2({
  initial,
  initialFlowerId = null,
  initialView = null,
}: {
  initial: GardenResult;
  initialFlowerId?: string | null;
  /** `?view=`: Memories, Achievements, Songs, Settings or the guide over the world (#183). */
  initialView?: GardenView | null;
}) {
  const { state, now, error, busy, mutate } = useGardenV2(initial);
  const partner = usePartnerName();
  const reducedMotion = usePrefersReducedMotion();
  const [worldStatus, setWorldStatus] = useState<WorldStatus>("loading");
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const [news, setNews] = useState<AwayNews>(noAwayNews);
  const [wandered, setWandered] = useState(false);
  const [view, setView] = useState<GardenView | null>(initialFlowerId ? null : initialView);
  /** The flower the camera is gliding to or showing in its painting (its seeds wait for the painting). */
  const [visiting, setVisiting] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const visitSpot = useRef<number | null>(null);
  // Where focus returns when a view closes (#210): the hidden plot that opened it, else the world.
  const returnSpot = useRef<number | null>(null);
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
  // Opened by the walk through the house door: arrive under its warm light (#204).
  const arrival = useGardenArrival({ allowed: !initialFlowerId && !initialView, worldStatus, layersLoaded: flowerLayer !== null, reducedMotion });
  // A scoped sheet (such as a private moment) is open: the hint waits.
  const sheetOpen = Boolean(useSheetScope()?.active);
  const layout = useMemo(() => state ? typeAreaLayout(state) : null, [state]);
  const { flowers, anchors } = useWorldFlowers(state, layout);
  useEffect(() => flowerLayer?.setFlowers(flowers), [flowerLayer, flowers]);
  // Any full-screen view (a flower, planting, or an overlay such as Memories) covers the world.
  const covered = mode.kind !== "idle" || view !== null;
  // Night fireworks after a day with an achievement (#184); they pause with the world behind the split view.
  const fireworks = useNightFireworks({ state, now, covered, worldReady: worldStatus === "ready" && arrival.settled, reducedMotion });
  const layers = useMemo(() => [flowerLayer, fireworks.layer].filter((layer) => layer !== null), [flowerLayer, fireworks.layer]);
  const occupied = useMemo(() => state?.plants.map((plant) => plant.flower.spot) ?? [], [state]);
  // A Dandelion's seeds blow away when its wish comes true (#201).
  const seedBlows = useSeedBlows({ state, layer: flowerLayer, openFlowerId: mode.kind === "flower" ? mode.id : null });
  useEffect(() => {
    flowerLayer?.deferSeeds(visiting);
  }, [flowerLayer, visiting]);
  // Nothing blows under the arrival's fading light (#204); waiting puffs simply wait.
  useEffect(() => {
    flowerLayer?.holdSeeds(!arrival.settled);
  }, [flowerLayer, arrival.settled]);

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
      setMode({ kind: "idle" });
      setVisiting(id);
      setWandered(true);
      window.history.replaceState(window.history.state, "", flowerHref(id));
      glide({ position: anchor.position, height: anchor.height ?? 0.8 }, () => setMode({ kind: "flower", id }), immediate);
    },
    [anchors, glide],
  );

  const startPlant = useCallback(
    (spot: number) => {
      const area = layout?.areas.find((candidate) => candidate.target.spot === spot);
      if (!area) return;
      setMode({ kind: "idle" });
      setVisiting(null);
      setWandered(true);
      glide({ position: area.target.position, height: 0.7 }, () => setMode({ kind: "plant", spot: area.target.persistedSpot, type: area.type }));
    },
    [glide, layout],
  );

  const openView = useCallback((next: GardenView) => {
    // Ends any glide or close-look hold (#201): the camera is released too.
    window.clearTimeout(timer.current);
    setFocus(null);
    setMode({ kind: "idle" });
    setVisiting(null);
    setWandered(true);
    setView(next);
    window.history.replaceState(window.history.state, "", gardenViewHref(next));
  }, []);

  const closeView = useCallback(() => {
    setView(null);
    window.history.replaceState(window.history.state, "", GARDEN_PATH);
  }, []);

  const { awaitsWorld } = seedBlows;
  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    const closing = visiting;
    setMode({ kind: "idle" });
    setVisiting(null);
    if (closing !== null && awaitsWorld(closing)) {
      // The seeds blow in the world as you return: hold the close look while they lift.
      timer.current = window.setTimeout(() => setFocus(null), reducedMotion ? STILL_SEED_HOLD_MS : SEED_HOLD_MS);
    } else {
      setFocus(null);
    }
    window.history.replaceState(window.history.state, "", GARDEN_PATH);
  }, [visiting, awaitsWorld, reducedMotion]);

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

  // The hidden keyboard list groups flowers by type, with one planting target per area.
  const plots = useMemo(() => (state ? gardenPlots(state, partner.short) : []), [state, partner.short]);
  const openPlot = useCallback(
    (plot: GardenPlot) => {
      returnSpot.current = plot.spot;
      if (plot.plant) visit(plot.plant.flower.id);
      else startPlant(plot.spot);
    },
    [visit, startPlant],
  );
  // A tap in the world (or a flower chosen in an overlay) returns focus to the world.
  const pickFlower = useCallback(
    (id: string) => {
      returnSpot.current = null;
      visit(id);
    },
    [visit],
  );
  const pickSpot = useCallback(
    (spot: number) => {
      returnSpot.current = null;
      startPlant(spot);
    },
    [startPlant],
  );
  // "next: …" in the panel: a visit begun from the list returns to the next flower's plot.
  const visitNext = useCallback(
    (id: string) => {
      if (returnSpot.current !== null) returnSpot.current = state?.plants.find((plant) => plant.flower.id === id)?.flower.spot ?? null;
      visit(id);
    },
    [state, visit],
  );
  const returnFocus = useCallback(() => focusPlot(returnSpot.current), []);

  // A small "♡" floats over every flower still waiting on your care today (#214), following the
  // plant's height as it grows. It is left out while the camera glides to a flower or a
  // full-screen view covers the world; the arrival's light hides it like the title.
  const waiting = useMemo(() => (state ? waitingOnYou(state) : []), [state]);
  const captions = useMemo<readonly WorldCaption[]>(() => {
    if (covered || focus !== null) return TITLE;
    const hearts = careHearts(waiting, anchors);
    const areas = layout?.areas.map((area): WorldCaption => ({ id: `area-${area.type}`, text: area.name, position: areaLabelPosition(area), onSelect: () => pickSpot(area.target.spot) })) ?? [];
    return [...TITLE, ...areas, ...hearts];
  }, [waiting, anchors, covered, focus, layout, pickSpot]);

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
      className={`${styles.page} ${styles.theme} ${handFont.className} ${arrival.chromeClassName}`}
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
        plantingLayout={layout!}
        occupiedSpots={occupied}
        flowers={anchors}
        layers={layers}
        captions={captions}
        focus={focus}
        paused={covered}
        walking
        walkingBlocked={covered || sheetOpen || !arrival.settled}
        arrival={arrival.world}
        onView={arrival.onView}
        onStatusChange={setWorldStatus}
        onPickFlower={pickFlower}
        onPickSpot={pickSpot}
        label={`Our painted garden by the lake, with ${state.plants.length} ${state.plants.length === 1 ? "flower" : "flowers"}`}
      />
      <nav className={styles.corner} aria-label="Leave the garden">
        <Link href="/">home</Link>
        <Link href={legacyPath}>old garden</Link>
      </nav>
      <GardenOverlays
        view={view}
        memberId={state.member_id}
        arrivedByLink={!!initialFlowerId || !!initialView}
        canGreet={worldStatus === "ready" && arrival.settled && mode.kind === "idle"}
        flowerOpen={mode.kind !== "idle"}
        onOpen={openView}
        onClose={closeView}
        onVisit={(id) => {
          setView(null);
          pickFlower(id);
        }}
      />
      <FireworksOverlay {...fireworks.overlay} hidden={covered} />
      {worldStatus === "ready" && arrival.settled && !wandered && !covered && !sheetOpen && (
        <p className={styles.hint}>WASD / arrows to walk · tap ground to wander · tap a flower to visit</p>
      )}
      {/* The away note waits for the fireworks to finish, so their words never overlap. */}
      {!covered && arrival.settled && !fireworks.overlay.playing && hasAwayNews(news) && <AwayNote news={news} state={state} onDismiss={() => setNews(noAwayNews)} />}
      {error && !covered && (
        <p className={styles.toast} role="status">
          {error}
        </p>
      )}
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
      {/* The hidden plot list (#210) is there once the arrival from the house has settled; it
          comes last in the keyboard order, after the page's other controls. */}
      {worldStatus !== "unsupported" && worldStatus !== "stopped" && arrival.settled && plots.length > 0 && (
        <PlotList plots={plots} onOpen={openPlot} hidden={covered || sheetOpen} />
      )}
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
          onReturnFocus={returnFocus}
          blowSeeds={seedBlows.heroToken}
        >
          <FlowerPanel
            key={openPlant.flower.id}
            plant={openPlant}
            state={state}
            item={openItem}
            now={now}
            busy={busy}
            mutate={mutate}
            onVisit={visitNext}
            onSeedsBlown={seedBlows.fulfilled}
          />
        </SplitView>
      )}
      <PlantView
        key={mode.kind === "plant" ? `${mode.spot}-${mode.type}` : "closed"}
        initialType={mode.kind === "plant" ? mode.type : "rose"}
        spot={mode.kind === "plant" ? mode.spot : null}
        state={state}
        busy={busy}
        mutate={mutate}
        onClose={close}
        onReturnFocus={returnFocus}
        onPlanted={(result, spot) => {
          const planted = result.state?.plants.find((plant) => plant.flower.spot === spot);
          const name = planted ? captionName(catalogItem(result.state!, planted.flower.type_key), planted.flower.type_key) : "flower";
          setAnnouncement(`The ${name} is planted.`);
          setMode({ kind: "idle" });
          visitSpot.current = spot;
        }}
      />
      <ArrivalLight phase={arrival.phase} lightRef={arrival.lightRef} />
    </main>
  );
}
