import { expect, it } from "vitest";
import type { FlowerType } from "./flower-sprite";
import type { GardenState, Plant } from "@/lib/garden/model";
import { entryFixture, gardenFixture } from "@/test/garden-fixture";
import { flowerCards, nextDueFlower } from "./flower-cards";

function plantAt(state: GardenState, spot: number, type: FlowerType): Plant {
  const plant = structuredClone(state.plants[0]);
  plant.flower = { ...plant.flower, id: `flower-${spot}`, spot, type_key: type };
  return plant;
}

it("leads with the partner card once the partner has cared, otherwise with yours", () => {
  const plant = gardenFixture().plants[0];
  const order = (member: 1 | 2) =>
    flowerCards(plant, member, true).map((card) => card.who);
  expect(order(1)).toEqual(["you", "partner"]);
  plant.member2_submitted = true;
  plant.entries = [{ ...entryFixture(), id: 7, author_id: 2 }];
  expect(order(1)).toEqual(["partner", "you"]);
  const [partner, you] = flowerCards(plant, 1, true);
  expect(partner).toMatchObject({ cared: true, entries: [{ id: 7 }] });
  expect(you).toMatchObject({ cared: false, entries: [] });
  // Member 2 sees the same entry as their own, with an empty partner card.
  expect(flowerCards(plant, 2, true)[0]).toMatchObject({
    who: "you",
    cared: true,
    entries: [{ id: 7 }],
  });
});

it("shows only cards with entries when no daily care is needed", () => {
  const plant = gardenFixture().plants[0];
  expect(flowerCards(plant, 1, false)).toEqual([]);
  plant.entries = [entryFixture()];
  expect(flowerCards(plant, 1, false).map((card) => card.who)).toEqual(["you"]);
});

it("finds the next due flower in spot order, wrapping and following the care-dot rule", () => {
  const state = gardenFixture();
  const cactus = state.plants[0];
  const rose = plantAt(state, 2, "rose");
  const peony = plantAt(state, 3, "peony");
  const bloomed = plantAt(state, 4, "marigold");
  bloomed.flower.first_bloom_at = state.server_now;
  const moon = plantAt(state, 5, "moonflower");
  const caredTulip = plantAt(state, 6, "tulip");
  caredTulip.member1_submitted = true;
  const daisy = plantAt(state, 7, "daisy");
  daisy.member2_submitted = true; // Partner care alone keeps it due for you.
  state.plants = [daisy, caredTulip, moon, bloomed, peony, rose, cactus];

  expect(nextDueFlower(state, 2)?.flower.spot).toBe(7);
  expect(nextDueFlower(state, 7)?.flower.spot).toBe(1);
  state.moonflower_open = true;
  expect(nextDueFlower(state, 2)?.flower.spot).toBe(5);
  // A bloomed Cactus still takes check-ins; the current spot is never offered.
  cactus.flower.first_bloom_at = state.server_now;
  expect(nextDueFlower(state, 7)?.flower.spot).toBe(1);
  state.member_id = 2;
  expect(nextDueFlower(state, 2)?.flower.spot).toBe(5);
  for (const plant of [cactus, rose, moon, caredTulip, daisy])
    plant.member2_submitted = true;
  expect(nextDueFlower(state, 2)).toBeNull();
});
