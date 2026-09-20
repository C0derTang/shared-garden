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
it("shares a live channel across persistent garden and panel consumers without removing another consumer", async () => {
  vi.useFakeTimers();
  let subscribed = false;
  let update!: () => void;
  const channel = {
    on: vi.fn((_event, _filter, callback) => { if (subscribed) throw Error("already subscribed"); update = callback; return channel; }),
    subscribe: vi.fn((callback) => { subscribed = true; callback("SUBSCRIBED"); return channel; }),
  };
  const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
  const garden = vi.fn(), memories = vi.fn();
  const stopGarden = subscribeGarden(client as unknown as SupabaseClient, garden, vi.fn());
  const stopMemories = subscribeGarden(client as unknown as SupabaseClient, memories, vi.fn());
  await vi.advanceTimersByTimeAsync(200);
  expect(garden).toHaveBeenCalledTimes(1);
  expect(memories).toHaveBeenCalledTimes(1);
  stopMemories(); update(); await vi.advanceTimersByTimeAsync(200);
  expect(garden).toHaveBeenCalledTimes(2);
  expect(memories).toHaveBeenCalledTimes(1);
  expect(client.removeChannel).not.toHaveBeenCalled();
  stopGarden(); expect(client.removeChannel).toHaveBeenCalledOnce();
  expect(client.channel).toHaveBeenCalledOnce();
});
it("reports current connection state to late consumers and isolates a new channel from pending removal", async () => {
  const channels = new Map<string, { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn>; status?: (value: string) => void }>();
  const removals: (() => void)[] = [];
  const client = {
    channel: (name: string) => {
      if (!channels.has(name)) {
        const channel = { on: vi.fn(), subscribe: vi.fn(), status: undefined as ((value: string) => void) | undefined };
        channel.on.mockReturnValue(channel);
        channel.subscribe.mockImplementation((callback) => { channel.status = callback; return channel; });
        channels.set(name, channel);
      }
      return channels.get(name)!;
    },
    removeChannel: vi.fn((channel) => new Promise((resolve) => removals.push(() => { for (const [key, value] of channels) if (value === channel) channels.delete(key); resolve("ok"); }))),
  };
  const firstStatus = vi.fn(), panelStatus = vi.fn(), newStatus = vi.fn();
  const stop = subscribeGarden(client as unknown as SupabaseClient, vi.fn(), firstStatus);
  const oldChannel = [...channels.values()][0];
  oldChannel.status!("SUBSCRIBED");
  const stopPanel = subscribeGarden(client as unknown as SupabaseClient, vi.fn(), panelStatus);
  expect(panelStatus).toHaveBeenLastCalledWith(true);
  oldChannel.status!("CHANNEL_ERROR");
  expect(firstStatus).toHaveBeenLastCalledWith(false);
  expect(panelStatus).toHaveBeenLastCalledWith(false);
  stop(); stopPanel();
  const stopNew = subscribeGarden(client as unknown as SupabaseClient, vi.fn(), newStatus);
  expect(channels.size).toBe(2);
  removals[0]();
  expect(channels.size).toBe(1);
  [...channels.values()][0].status!("SUBSCRIBED");
  expect(newStatus).toHaveBeenLastCalledWith(true);
  stopNew(); removals[1]();
});
