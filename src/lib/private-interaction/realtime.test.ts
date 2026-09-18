import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { subscribeInteraction } from "./realtime";
afterEach(() => vi.useRealTimers());
it("coalesces authorized change signals and stops queued refresh after disposal", () => {
  vi.useFakeTimers();
  const handlers: (() => void)[] = [];
  const channel = { on: vi.fn((_kind: string, _filter: unknown, handler: () => void) => { handlers.push(handler); return channel; }), subscribe: vi.fn() };
  const client = { channel: () => channel, removeChannel: vi.fn() };
  const refresh = vi.fn();
  const stop = subscribeInteraction(client as unknown as SupabaseClient, refresh);
  handlers.forEach((handler) => handler());
  vi.advanceTimersByTime(150);
  expect(refresh).toHaveBeenCalledTimes(1);
  handlers[0](); stop(); vi.advanceTimersByTime(150);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(client.removeChannel).toHaveBeenCalledWith(channel);
});
