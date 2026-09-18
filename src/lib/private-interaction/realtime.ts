import type { SupabaseClient } from "@supabase/supabase-js";
/** Only safe awards and the owner-RLS revision are subscribed; payloads are ignored. */
export function subscribeInteraction(client: SupabaseClient, refresh: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const invalidate = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = undefined; if (!stopped) refresh(); }, 150);
  };
  const channel = client.channel("private-interaction-refresh", {
    config: { postgres_changes_options: { wait: true, timeout: 15000 } },
  });
  for (const table of ["achievement_awards", "private_interaction_signals"]) {
    for (const event of ["INSERT", "UPDATE"] as const) {
      channel.on("postgres_changes", { event, schema: "public", table }, invalidate);
    }
  }
  channel.subscribe((status) => { if (status === "SUBSCRIBED") invalidate(); });
  return () => { stopped = true; if (timer) clearTimeout(timer); void client.removeChannel(channel); };
}
