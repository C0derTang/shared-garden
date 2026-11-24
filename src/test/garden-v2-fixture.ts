import type { Entry, GardenState } from "@/lib/garden-v2/model";
import { flowerTypes } from "@/lib/garden-v2/model";

const targets: Record<string, number> = {
  rose: 5, cactus: 10, tulip: 7, marigold: 5, daisy: 7, hydrangea: 7, sunflower: 7,
  snapdragon: 5, moonflower: 5, bluebell: 7, dandelion: 5, "forget-me-not": 10, peony: 4,
};
export function v2EntryFixture(): Entry {
  return {
    id: 1,
    flower_id: "00000000-0000-4000-8000-000000000001",
    author_id: 1,
    garden_day: "2026-11-02",
    original_posted_at: "2026-11-02T17:00:00Z",
    updated_at: "2026-11-02T17:00:00Z",
    payload: { text: "A synthetic note." },
    daisy_assignment_day: null,
    edit_deadline: "2026-11-02T17:30:00Z",
    edit_deadline_inclusive: true,
    can_edit: true,
  };
}
export function v2GardenFixture(): GardenState {
  const clock = {
    server_now: "2026-11-02T17:00:00Z",
    garden_day: "2026-11-02",
    day_starts_at: "2026-11-02T12:00:00Z",
    next_rollover_at: "2026-11-03T12:00:00Z",
    moonflower_open: false,
  };
  return {
    ...clock,
    member_id: 1,
    garden: {
      id: 1,
      initialized_at: clock.server_now,
      next_spot: 2,
      spot_capacity: 12,
      last_settled_day: "2026-11-01",
      current_streak: 0,
      longest_streak: 0,
      qualifying_days: 0,
    },
    catalog: flowerTypes.map((type_key) => ({
      type_key,
      display_name: type_key,
      action_label: "Care",
      growth_target: targets[type_key],
    })),
    plants: [
      {
        ...clock,
        flower: {
          id: "00000000-0000-4000-8000-000000000001",
          garden_id: 1,
          type_key: "rose",
          spot: 1,
          seed: 4503599627370495,
          planted_at: clock.server_now,
          planted_day: clock.garden_day,
          planted_by: 1,
          shared_wish: null,
          growth_units: 0,
          first_bloom_at: null,
          first_bloom_day: null,
          fulfilled_at: null,
          fulfilled_by: null,
        },
        entries: [v2EntryFixture()],
        hydrangea_picks: [null, null],
        daisy_question: null,
        member1_submitted: true,
        member2_submitted: false,
      },
    ],
  };
}
