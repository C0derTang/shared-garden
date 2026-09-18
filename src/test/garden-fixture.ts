import type { GardenState, Entry } from "@/lib/garden/model";

export function entryFixture(): Entry {
  return {
    id: 1,
    flower_id: "00000000-0000-4000-8000-000000000001",
    author_id: 1,
    garden_day: "2026-09-18",
    original_posted_at: "2026-09-18T17:00:00Z",
    updated_at: "2026-09-18T17:00:00Z",
    payload: { text: "A quiet walk together." },
    daisy_assignment_day: null,
    edit_deadline: "2026-09-18T17:30:00Z",
    edit_deadline_inclusive: true,
    can_edit: true,
  };
}
export function gardenFixture(): GardenState {
  const clock = {
    server_now: "2026-09-18T17:00:00Z",
    garden_day: "2026-09-18",
    day_starts_at: "2026-09-18T11:00:00Z",
    next_rollover_at: "2026-09-19T11:00:00Z",
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
      last_settled_day: "2026-09-17",
      current_streak: 0,
      longest_streak: 0,
      qualifying_days: 0,
    },
    catalog: [
      {
        type_key: "cactus",
        display_name: "Cactus",
        action_label: "One-tap check-in",
        growth_target: 10,
        unfinished_limit: 1,
        unlock_after_blooms: 0,
      },
      {
        type_key: "rose",
        display_name: "Rose",
        action_label: "Note about today",
        growth_target: 5,
        unfinished_limit: 3,
        unlock_after_blooms: 0,
      },
      {
        type_key: "tulip",
        display_name: "Tulip",
        action_label: "Share a song",
        growth_target: 7,
        unfinished_limit: 1,
        unlock_after_blooms: 0,
      },
      {
        type_key: "marigold",
        display_name: "Marigold",
        action_label: "Compliment or appreciation",
        growth_target: 5,
        unfinished_limit: 2,
        unlock_after_blooms: 0,
      },
      ...(
        [
          "daisy",
          "hydrangea",
          "sunflower",
          "snapdragon",
          "moonflower",
          "bluebell",
          "dandelion",
          "forget-me-not",
          "peony",
        ] as const
      ).map((type_key, i) => ({
        type_key,
        display_name: type_key[0].toUpperCase() + type_key.slice(1),
        action_label: "Shared care",
        growth_target:
          (
            {
              snapdragon: 5,
              moonflower: 5,
              dandelion: 5,
              "forget-me-not": 10,
              peony: 4,
            } as Record<string, number>
          )[type_key] ?? 7,
        unfinished_limit: type_key === "dandelion" ? 3 : 1,
        unlock_after_blooms: i + 1,
      })),
    ],
    unlocks: ["cactus", "rose", "tulip", "marigold"].map((type_key) => ({
      type_key,
      unlocked_at: clock.server_now,
    })),
    plants: [
      {
        ...clock,
        flower: {
          id: "00000000-0000-4000-8000-000000000001",
          garden_id: 1,
          type_key: "cactus",
          spot: 1,
          planted_at: clock.server_now,
          planted_day: clock.garden_day,
          planted_by: null,
          is_initial: true,
          shared_wish: null,
          growth_units: 0,
          first_bloom_at: null,
          first_bloom_day: null,
          fulfilled_at: null,
          fulfilled_by: null,
        },
        entries: [],
        daisy_question: null,
        member1_submitted: false,
        member2_submitted: false,
      },
    ],
  };
}
