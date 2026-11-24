import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Published new-garden tables. RLS authorizes each change; payloads only
 * invalidate the authoritative `v2_current_garden_state` snapshot. Later v2
 * features (Peony, achievements, media) extend this list with their tables.
 */
export const V2_REALTIME_TABLES = ["v2_flowers", "v2_flower_entries", "v2_entry_replies"] as const;

let channelSequence = 0;

function openChannel(client: SupabaseClient, refresh: () => void, connected: (value: boolean) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const invalidate = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped) refresh();
    }, 150);
  };
  const channel = client.channel(`shared-garden-v2-state-${++channelSequence}`, {
    config: { postgres_changes_options: { wait: true, timeout: 15000 } },
  });
  for (const table of V2_REALTIME_TABLES)
    for (const event of ["INSERT", "UPDATE"] as const)
      channel.on(
        "postgres_changes",
        { event, schema: "public", table, ...(table === "v2_flowers" ? { filter: "garden_id=eq.1" } : {}) },
        invalidate,
      );
  channel.subscribe((status) => {
    if (stopped) return;
    connected(status === "SUBSCRIBED");
    if (status === "SUBSCRIBED") invalidate();
  });
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    void client.removeChannel(channel);
  };
}

type Listener = { refresh: () => void; connected: (value: boolean) => void };
type Shared = { listeners: Set<Listener>; connected: boolean; stop: () => void };
const subscriptions = new WeakMap<SupabaseClient, Shared>();

/** The new garden and its panels share one invalidation channel per client. */
export function subscribeGardenV2(client: SupabaseClient, refresh: () => void, connected: (value: boolean) => void) {
  const listener = { refresh, connected };
  let shared = subscriptions.get(client);
  if (!shared) {
    shared = { listeners: new Set([listener]), connected: false, stop: () => {} };
    subscriptions.set(client, shared);
    const active = shared;
    active.stop = openChannel(
      client,
      () => active.listeners.forEach((item) => item.refresh()),
      (value) => {
        active.connected = value;
        active.listeners.forEach((item) => item.connected(value));
      },
    );
  } else {
    shared.listeners.add(listener);
    connected(shared.connected);
  }
  const active = shared;
  return () => {
    if (!active.listeners.delete(listener)) return;
    if (!active.listeners.size) {
      subscriptions.delete(client);
      active.stop();
    }
  };
}
