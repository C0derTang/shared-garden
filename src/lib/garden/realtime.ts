import type { SupabaseClient } from "@supabase/supabase-js";

/** RLS authorizes each Postgres change. Payloads only invalidate server snapshots. */
export function subscribeGarden(
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
  const channel = client.channel("shared-garden-state", {
    config: { postgres_changes_options: { wait: true, timeout: 15000 } },
  });
  for (const table of ["flowers", "flower_entries", "flower_unlocks"]) {
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
