"use client";
import { useEffect, useState } from "react";
import { GardenV2 } from "@/components/garden-v2/garden-v2";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { SheetScope } from "@/components/ui/sheet-scope";
import { markGardenArrival } from "@/lib/garden-v2/arrival";
import type { GardenState } from "@/lib/garden-v2/model";

/** Mounted only by the production-404 synthetic route, never a real garden. */
export function GardenFixture({ state, arrival, scope }: { state: GardenState; arrival: boolean; scope: boolean }) {
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (arrival) markGardenArrival();
    // The real landing handoff mounts the garden during client navigation.
    // Mount after hydration here to exercise that same arrival hook.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- development fixture emulates client navigation
    setStarted(true);
  }, [arrival]);
  return <SheetScope>
    {(!arrival || started) && <GardenV2 initial={{ state, error: null }} />}
    {scope && <BottomSheet trigger={<button type="button" style={{ position: "fixed", right: 16, top: 64 }}>synthetic scoped sheet</button>} title="Synthetic scoped draft" description="Local input interruption fixture">
      <label>Synthetic draft<textarea aria-label="Synthetic draft" /></label>
    </BottomSheet>}
  </SheetScope>;
}
