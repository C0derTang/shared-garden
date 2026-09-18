import { afterEach, expect, it, vi } from "vitest";
import { subscribeGarden } from "./realtime";
import type { SupabaseClient } from "@supabase/supabase-js";
afterEach(() => vi.useRealTimers());
it("coalesces invalidations, refreshes on reconnect, and cleans up pending updates", async () => {
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
  const client = {
    channel: () => channel,
    removeChannel,
  } as unknown as SupabaseClient;
  const refresh = vi.fn();
  const state = vi.fn();
  const stop = subscribeGarden(client, refresh, state);
  status("SUBSCRIBED");
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(1);
  changes.forEach((f) => f());
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(2);
  status("CHANNEL_ERROR");
  expect(state).toHaveBeenLastCalledWith(false);
  status("SUBSCRIBED");
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(3);
  changes[0]();
  stop();
  await vi.advanceTimersByTimeAsync(200);
  expect(refresh).toHaveBeenCalledTimes(3);
  expect(removeChannel).toHaveBeenCalledWith(channel);
  expect(
    channel.on.mock.calls.every((call) =>
      ["INSERT", "UPDATE"].includes(call[1].event),
    ),
  ).toBe(true);
});
