"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FireworksLayer } from "@/components/world/fireworks/fireworks-layer";
import type { FireworksOverlayProps } from "@/components/world/fireworks/fireworks-overlay";
import { readAwardsForDayV2 } from "@/lib/garden-v2/achievement-actions";
import {
  fireworksCaption,
  fireworksNightAt,
  fireworksSeed,
  nightAwardsFrom,
  planFireworks,
  readFireworksSeen,
  writeFireworksSeen,
  type NightAwards,
} from "@/lib/garden-v2/fireworks";
import type { GardenState } from "@/lib/garden-v2/model";

/** While it is night, today's awards are re-read at least this often (ms). */
const AWARD_POLL_MS = 180_000;

/** Changes whenever an operation that can earn an achievement shows in the garden. */
function activitySignature(state: GardenState): string {
  let entries = 0;
  let growth = 0;
  let bloomed = 0;
  let fulfilled = 0;
  for (const plant of state.plants) {
    entries += plant.entries.length;
    growth += plant.flower.growth_units;
    if (plant.flower.first_bloom_at) bloomed += 1;
    if (plant.flower.fulfilled_at) fulfilled += 1;
  }
  return `${state.plants.length}:${entries}:${growth}:${bloomed}:${fulfilled}:${state.garden.current_streak}`;
}

export interface NightFireworks {
  /** The world layer that paints the show (null until its code has loaded). */
  readonly layer: FireworksLayer | null;
  readonly overlay: Omit<FireworksOverlayProps, "hidden">;
}

/**
 * The garden's night fireworks (#184): after sunset on a garden day with an
 * achievement, the show plays by itself once per member per night (when the
 * painted world is ready and nothing covers it), then only from "replay
 * fireworks". Reduced motion gets a still sky of open bursts instead.
 */
export function useNightFireworks({
  state,
  now,
  covered,
  worldReady,
  reducedMotion,
}: {
  state: GardenState | null;
  now: number;
  covered: boolean;
  worldReady: boolean;
  reducedMotion: boolean;
}): NightFireworks {
  // The layer's GPU code and shaders load with the world, not in the page's first bundle.
  const [layer, setLayer] = useState<FireworksLayer | null>(null);
  useEffect(() => {
    let cancelled = false;
    void import("@/components/world/fireworks/fireworks-layer").then(({ createFireworksLayer }) => {
      if (!cancelled) setLayer(createFireworksLayer());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const memberId = state?.member_id ?? null;
  const { night, gardenDay } = fireworksNightAt(now);
  const atNight = state !== null && night;
  const signature = state ? activitySignature(state) : "";
  const poll = Math.floor(now / AWARD_POLL_MS);
  const [awards, setAwards] = useState<NightAwards | null>(null);
  useEffect(() => {
    if (!atNight) return;
    let cancelled = false;
    void readAwardsForDayV2(gardenDay).then((result) => {
      // An unreadable answer keeps what we knew; the next change or poll tries again.
      if (!cancelled && result.state) setAwards(nightAwardsFrom(result.state, gardenDay));
    });
    return () => {
      cancelled = true;
    };
  }, [atNight, gardenDay, signature, poll]);

  const plan = planFireworks(now, state ? awards : null, null);
  const [playing, setPlaying] = useState(false);
  const replays = useRef(0);

  const start = useCallback(
    (day: string) => {
      if (!layer || memberId === null) return;
      replays.current += 1;
      layer.play({
        seed: fireworksSeed(day, replays.current),
        still: reducedMotion,
        onStart: () => writeFireworksSeen(memberId, day),
        onEnd: () => setPlaying(false),
      });
      setPlaying(true);
    },
    [layer, memberId, reducedMotion],
  );

  // Once per member per night, by itself, when the world can show it.
  const tried = useRef<string | null>(null);
  useEffect(() => {
    if (!plan.eligible || !layer || !worldReady || covered || playing || memberId === null) return;
    if (tried.current === plan.gardenDay) return;
    tried.current = plan.gardenDay;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage and the GPU layer are only reachable after hydration
    if (planFireworks(now, awards, readFireworksSeen(memberId)).autoplay) start(plan.gardenDay);
  }, [plan.eligible, plan.gardenDay, layer, worldReady, covered, playing, memberId, now, awards, start]);

  useEffect(() => () => layer?.stop(), [layer]);

  return {
    layer,
    overlay: {
      caption: fireworksCaption(plan.titles),
      playing,
      canReplay: plan.eligible && worldReady && layer !== null,
      onReplay: () => start(plan.gardenDay),
    },
  };
}
