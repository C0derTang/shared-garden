import { describe, expect, it } from "vitest";
import { v2GardenFixture } from "@/test/garden-v2-fixture";
import { flowerTypes } from "./model";
import { typeAreaLayout } from "./type-areas";

// Regressions: missing empty types, rank compaction, cross-type overlap and
// accidentally rewriting persisted identity/history while grouping the view.
describe("type areas", () => {
  it("keeps all thirteen named areas and one type-specific planting target when empty", () => {
    const state = v2GardenFixture();
    state.plants = [];
    state.garden.next_spot = 1;
    const layout = typeAreaLayout(state);
    expect(layout.areas.map((area) => area.type)).toEqual(flowerTypes);
    expect(layout.spots).toHaveLength(13);
    expect(new Set(layout.spots.map((spot) => spot.spot)).size).toBe(13);
    expect(layout.areas.every((area) => area.target.persistedSpot === 1)).toBe(true);
  });

  it("groups mixed types without touching identities, seeds, growth or history", () => {
    const state = v2GardenFixture();
    const rose = state.plants[0]!;
    state.plants.push({ ...structuredClone(rose), flower: { ...rose.flower, id: "cactus", spot: 12, type_key: "cactus" } });
    const before = structuredClone(state);
    const layout = typeAreaLayout(state);
    expect(layout.spots.find((spot) => spot.spot === 1)!.position[0]).toBeLessThan(-18);
    expect(layout.spots.find((spot) => spot.spot === 12)!.position[0]).toBeLessThan(-15);
    expect(layout.areas.find((area) => area.type === "rose")!.plants).toEqual([rose]);
    expect(state).toEqual(before);
  });

  it("does not move an existing flower when a lower hole or a repeated type is planted", () => {
    const state = v2GardenFixture();
    state.plants[0]!.flower.spot = 24;
    state.garden.next_spot = 1;
    const before = typeAreaLayout(state);
    state.plants.push({ ...structuredClone(state.plants[0]!), flower: { ...state.plants[0]!.flower, id: "new", spot: 1 } });
    state.garden.next_spot = 2;
    const after = typeAreaLayout(state);
    expect(after.spots.find((spot) => spot.spot === 24)).toEqual(before.spots.find((spot) => spot.spot === 24));
    expect(after.spots.find((spot) => spot.spot === 1)!.position).toEqual(before.areas[0]!.target.position);
    for (const bed of after.beds) for (const other of after.beds) {
      if (bed.index === other.index) continue;
      expect(Math.hypot(bed.center[0] - other.center[0], bed.center[2] - other.center[2])).toBeGreaterThan(bed.radius + other.radius);
    }
  });

  it("bounds geometry by occupied modules rather than generating all holes", () => {
    const state = v2GardenFixture();
    state.plants[0]!.flower.spot = 12001;
    const layout = typeAreaLayout(state);
    expect(layout.beds.length).toBeLessThanOrEqual(27);
    expect(layout.spots).toHaveLength(14);
    expect(layout.maxZ).toBeGreaterThan(3000);
  });
});

// The actual camera/picking algorithms must agree with the layout at both widths.
import { gardenFovY, gardenPose, gardenViewProjection } from "@/lib/world/garden-camera";
import { projectToNdc } from "@/lib/world/camera";
import { pickOnScreen, plotFootprints } from "@/lib/world/picking";
import { buildBedMesh } from "@/lib/world/scenery";

it.each([[1280, 800], [390, 844]])("reaches and picks every area and occupied address at %ix%i", (width, height) => {
  const state = v2GardenFixture();
  const template = state.plants[0]!;
  state.plants = Array.from({ length: 39 }, (_, i) => ({ ...structuredClone(template), flower: { ...template.flower, id: `plant-${i}`, spot: i + 1, type_key: flowerTypes[i % 13]! } }));
  state.garden.next_spot = 40;
  const layout = typeAreaLayout(state);
  const empty = layout.areas.map((area) => area.target);
  const flowers = layout.spots.filter((spot) => spot.spot > 0).map((spot) => ({ id: `plant-${spot.spot - 1}`, position: spot.position, height: 1.1, radius: 0.32 }));
  for (const spot of layout.spots) {
    const depth = layout.maxZ - 7.4;
    const journey = Math.min(1, Math.max(0, (layout.maxZ - spot.position[2]) / depth));
    const aspect = width / height;
    const pose = gardenPose({ journey, pan: spot.position[0], depth }, aspect, gardenFovY(aspect));
    const view = { width, height, viewProjection: gardenViewProjection(width, height, pose) };
    const footprint = plotFootprints(view, empty, flowers).find((plot) => spot.spot < 0 ? plot.target.kind === "spot" && plot.target.spot === spot.spot : plot.target.kind === "flower" && plot.target.id === `plant-${spot.spot - 1}`)!;
    expect(footprint).toBeDefined();
    const part = footprint.parts.at(-1)!;
    const x = (part.a[0] + part.b[0]) / 2;
    const y = (part.a[1] + part.b[1]) / 2;
    expect(x).toBeGreaterThan(0); expect(x).toBeLessThan(width);
    expect(y).toBeGreaterThan(0); expect(y).toBeLessThan(height);
    expect(pickOnScreen(view, x, y, empty, flowers)).toMatchObject(footprint.target);
    const ndc = projectToNdc(view.viewProjection, spot.position)!;
    expect(ndc[2]).toBeLessThan(1);
  }
  const mesh = buildBedMesh(layout.beds);
  for (let i = 0; i < layout.beds.length; i += 1) {
    // Each disc starts with its centre: supplied beds, not the old mixed lattice.
    expect(mesh.vertices[(i * 41) * mesh.stride]).toBeCloseTo(layout.beds[i]!.center[0], 4);
    expect(mesh.vertices[(i * 41) * mesh.stride + 2]).toBeCloseTo(layout.beds[i]!.center[2], 4);
  }
});

it("advances the shared planting preview across sections while existing plants stay put", () => {
  const state = v2GardenFixture();
  state.garden.next_spot = 12;
  const before = typeAreaLayout(state);
  state.garden.next_spot = 13;
  const after = typeAreaLayout(state);
  expect(after.spots.find((spot) => spot.spot === 1)).toEqual(before.spots.find((spot) => spot.spot === 1));
  expect(after.areas.map((area) => area.target.spot)).toEqual(before.areas.map((area) => area.target.spot));
  expect(after.areas[1]!.target.position[2]).toBeGreaterThan(before.areas[1]!.target.position[2]);
  expect(after.areas[1]!.plants).toHaveLength(0);
});
