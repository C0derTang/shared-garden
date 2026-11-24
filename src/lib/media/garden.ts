// The media protocol serves two separate private registries (decision 0067,
// issue #178): the frozen legacy garden and the new garden. Each request names
// its garden; the server validates the name and alone maps it to buckets and
// RPCs. An absent discriminator keeps the unchanged legacy behavior.
export const mediaGardens = ["legacy", "v2"] as const;
export type MediaGarden = (typeof mediaGardens)[number];

export const mediaBuckets: Record<
  MediaGarden,
  { staging: string; media: string }
> = {
  legacy: { staging: "garden-staging", media: "garden-media" },
  v2: { staging: "garden-v2-staging", media: "garden-v2-media" },
};

// Every new-garden media and entry function mirrors its legacy name with v2_.
export function mediaRpc(garden: MediaGarden, name: string) {
  return garden === "v2" ? `v2_${name}` : name;
}
