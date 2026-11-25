"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FlowerLayer } from "@/components/world/flowers/flower-layer";
import { createSeedBlowPlanner, readSeedsSeen, writeSeedsSeen, type SeedBlowAction } from "@/lib/garden-v2/seed-blow";
import type { GardenState } from "@/lib/garden-v2/model";

export interface SeedBlows {
  /** The token that blows the open Dandelion's seeds in its painting, or null. */
  readonly heroToken: number | null;
  /** You made a Dandelion's wish come true. */
  readonly fulfilled: (flowerId: string) => void;
  /** True while this Dandelion's seeds wait to blow in the world. */
  readonly awaitsWorld: (flowerId: string) => boolean;
}

/**
 * A Dandelion's seeds blowing away when its wish comes true (#201): in its
 * painting for the member who blew them, then in the world as they return;
 * for the partner once, the first time they see it (see `seed-blow.ts`).
 */
export function useSeedBlows({ state, layer, openFlowerId }: { state: GardenState | null; layer: FlowerLayer | null; openFlowerId: string | null }): SeedBlows {
  const planner = useRef(createSeedBlowPlanner());
  const [hero, setHero] = useState<{ id: string; token: number } | null>(null);
  const tokens = useRef(0);
  /** World blows asked for before the flower layer had loaded. */
  const queued = useRef<string[]>([]);
  /** World blows asked for and not yet started. */
  const waitingWorld = useRef(new Set<string>());
  const layerRef = useRef(layer);
  const memberId = state?.member_id ?? null;
  const memberRef = useRef(memberId);
  useEffect(() => {
    memberRef.current = memberId;
  });

  const apply = useCallback((actions: readonly SeedBlowAction[]) => {
    for (const action of actions) {
      if (action.kind === "hero") {
        tokens.current += 1;
        setHero({ id: action.flowerId, token: tokens.current });
      } else if (action.kind === "seen") {
        if (memberRef.current !== null) writeSeedsSeen(memberRef.current, action.flowerId);
      } else {
        const target = layerRef.current;
        if (!target) {
          queued.current.push(action.flowerId);
          continue;
        }
        const flowerId = action.flowerId;
        waitingWorld.current.add(flowerId);
        target.blowSeeds(flowerId, {
          onStart: () => {
            waitingWorld.current.delete(flowerId);
            // The world only ever adds "seen" here.
            for (const next of planner.current.worldStarted(flowerId)) {
              if (next.kind === "seen" && memberRef.current !== null) writeSeedsSeen(memberRef.current, next.flowerId);
            }
          },
        });
      }
    }
  }, []);

  useEffect(() => {
    layerRef.current = layer;
    if (!layer || queued.current.length === 0) return;
    const ids = queued.current.splice(0);
    apply(ids.map((flowerId) => ({ kind: "world", flowerId })));
  }, [layer, apply]);

  // A partner's fulfilled Dandelion you have not watched yet: in its open painting, or in the world.
  useEffect(() => {
    if (!state) return;
    apply(planner.current.notice(state, readSeedsSeen(state.member_id), openFlowerId));
  }, [state, openFlowerId, apply]);

  // A painting blows its seeds once; reopening it later shows the golden head.
  const heroId = hero?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- forgets a played blow when its painting closes
    if (heroId !== null && heroId !== openFlowerId) setHero(null);
  }, [heroId, openFlowerId]);

  const fulfilled = useCallback((flowerId: string) => apply(planner.current.fulfilled(flowerId)), [apply]);
  const awaitsWorld = useCallback((flowerId: string) => waitingWorld.current.has(flowerId) || queued.current.includes(flowerId), []);
  return { heroToken: hero && hero.id === openFlowerId ? hero.token : null, fulfilled, awaitsWorld };
}
