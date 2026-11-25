import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeGardenV2, V2_REALTIME_TABLES } from "./realtime";

afterEach(() => vi.useRealTimers());
it("subscribes only to v2 tables, coalesces invalidations and cleans up", async () => {
  vi.useFakeTimers();
  const changes: (() => void)[] = [];
  let status: (s: string) => void = () => {};
  const channel = {
    on: vi.fn((_event, _filter, callback) => {
      changes.push(callback);
      return channel;
    }),
    subscribe: vi.fn((callback) => {
      status = callback;
      return channel;
    }),
  };
  const removeChannel = vi.fn();
  const client = { channel: vi.fn(() => channel), removeChannel } as unknown as SupabaseClient;
  const refresh = vi.fn();
  const connected = vi.fn();
  const stop = subscribeGardenV2(client, refresh, connected);
  expect(channel.on.mock.calls.map((call) => call[1])).toEqual(
    V2_REALTIME_TABLES.flatMap((table) =>
      ["INSERT", "UPDATE"].map((event) => ({
        event,
        schema: "public",
        table,
        ...(table === "v2_flowers" ? { filter: "garden_id=eq.1" } : {}),
      })),
    ),
  );
  status("SUBSCRIBED");
  expect(connected).toHaveBeenLastCalledWith(true);
  changes.forEach((change) => change());
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  status("CHANNEL_ERROR");
  expect(connected).toHaveBeenLastCalledWith(false);
  changes[0]();
  stop();
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(removeChannel).toHaveBeenCalledWith(channel);
});
it("includes the Peony and achievement tables", () => {
  expect(V2_REALTIME_TABLES).toEqual(
    expect.arrayContaining([
      "v2_peony_contributions",
      "v2_peony_plans",
      "v2_peony_acceptances",
      "v2_achievement_progress",
      "v2_achievement_awards",
    ]),
  );
});
it("shares one channel between consumers", () => {
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  const stopA = subscribeGardenV2(client as unknown as SupabaseClient, vi.fn(), vi.fn());
  const stopB = subscribeGardenV2(client as unknown as SupabaseClient, vi.fn(), vi.fn());
  expect(client.channel).toHaveBeenCalledOnce();
  stopA();
  expect(client.removeChannel).not.toHaveBeenCalled();
  stopB();
  expect(client.removeChannel).toHaveBeenCalledOnce();
});
