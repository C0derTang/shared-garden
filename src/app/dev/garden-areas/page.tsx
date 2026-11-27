import { notFound } from "next/navigation";
import { GardenFixture } from "./fixture";
import { parseGardenState } from "@/lib/garden-v2/model";
import fixture from "../../../../scripts/profiling/fixtures/type-area-garden.json";

/** Synthetic browser fixture only. Actions are intercepted by check-type-areas.mjs. */
export default async function TypeAreaFixture({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const state = parseGardenState(structuredClone(fixture));
  if (params.many === "1") {
    const templates=state.catalog.map(c=>state.plants.find(p=>p.flower.type_key===c.type_key)!);
    state.plants=templates.flatMap((p,type)=>Array.from({length:6},(_,i)=>({...structuredClone(p),flower:{...p.flower,id:`00000000-0000-4000-8000-${String(type*6+i+1).padStart(12,"0")}`,spot:type*6+i+1,seed:i+1,planted_at:`2026-06-01T12:00:${String(i).padStart(2,"0")}Z`}})));state.garden.next_spot=79;
  }
  if (params.bloom === "1") {
    state.plants = state.plants.map(p=>({...p,flower:{...p.flower,growth_units:state.catalog.find(c=>c.type_key===p.flower.type_key)!.growth_target,first_bloom_at:"2026-06-01T12:00:00Z",first_bloom_day:"2026-06-01"}}));
  }
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
