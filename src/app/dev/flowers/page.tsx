import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FlowerGallery, type GalleryView } from "@/components/world/flowers/flower-gallery";
import { flowerTypes, type FlowerType } from "@/lib/garden-v2/model";

export const metadata: Metadata = { title: "Procedural flowers (dev)" };

const VIEWS: readonly GalleryView[] = ["stages", "seeds", "type", "hero"];
const SKIES = ["day", "dusk", "night"] as const;

/** Development-only gallery of the procedural flowers. Production builds 404. */
export default async function FlowerGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const view = VIEWS.find((v) => v === params.view) ?? "stages";
  const type = flowerTypes.find((t) => t === params.type) ?? ("rose" as FlowerType);
  const sky = SKIES.find((s) => s === params.sky) ?? "dusk";
  const seedParam = typeof params.seed === "string" ? Number.parseInt(params.seed, 10) : Number.NaN;
  const seed = Number.isSafeInteger(seedParam) && seedParam >= 0 ? seedParam : 1;
  const framing = params.framing === "bloom" ? "bloom" : "plant";
  return <FlowerGallery initialView={view} initialType={type} initialSeed={seed} initialSky={sky} initialFraming={framing} />;
}
