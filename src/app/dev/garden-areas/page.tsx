import { notFound } from "next/navigation";
import { GardenFixture } from "./fixture";
import { parseGardenState } from "@/lib/garden-v2/model";
import fixture from "../../../../scripts/profiling/fixtures/type-area-garden.json";

/** Synthetic browser fixture only. Actions are intercepted by check-type-areas.mjs. */
export default async function TypeAreaFixture({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const state = parseGardenState(structuredClone(fixture));
  if (params.empty === "1") {
    state.plants = [];
    state.garden.next_spot = 1;
    state.garden.spot_capacity = 12;
  }
  if (params.boundary === "1") {
    state.plants = state.plants.filter(plant => plant.flower.spot !== 24);
    state.garden.next_spot = 24;
  }
  if (params.sparse === "1") {
    state.plants[0]!.flower.spot = 12001;
    state.garden.next_spot = 1;
    state.garden.spot_capacity = 12012;
  }
  return <GardenFixture state={state} arrival={params.arrival === "1"} scope={params.scope === "1"} />;
}
