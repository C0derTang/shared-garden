import type { SupabaseClient } from "@supabase/supabase-js";

let channelSequence = 0;

/** RLS authorizes each Postgres change. Payloads only invalidate server snapshots. */
function openGardenChannel(
  client: SupabaseClient,
  refresh: () => void,
  connected: (value: boolean) => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const invalidate = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped) refresh();
    }, 150);
  };
  const channel = client.channel(`shared-garden-state-${++channelSequence}`, {
    config: { postgres_changes_options: { wait: true, timeout: 15000 } },
  });
  for (const table of [
    "flowers",
    "flower_entries",
    "flower_unlocks",
    "peony_contributions",
    "peony_plans",
    "peony_acceptances",
    "achievement_progress",
    "achievement_awards",
  ]) {
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel.on(
        "postgres_changes",
        {
          event,
          schema: "public",
          table,
          ...(table === "flowers" ? { filter: "garden_id=eq.1" } : {}),
        },
        invalidate,
      );
    }
  }
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
/** A persistent garden and its panels share one invalidation channel. */
export function subscribeGarden(client: SupabaseClient, refresh: () => void, connected: (value: boolean) => void) {
  const listener = { refresh, connected };
  let shared = subscriptions.get(client);
  if (!shared) {
    shared = { listeners: new Set([listener]), connected: false, stop: () => {} };
    subscriptions.set(client, shared);
    const active = shared;
    active.stop = openGardenChannel(client,
      () => active.listeners.forEach((item) => item.refresh()),
      (value) => { active.connected = value; active.listeners.forEach((item) => item.connected(value)); },
    );
  } else {
    shared.listeners.add(listener);
    connected(shared.connected);
  }
  const active = shared;
  return () => {
    if (!active.listeners.delete(listener)) return;
    if (!active.listeners.size) { subscriptions.delete(client); active.stop(); }
  };
}
