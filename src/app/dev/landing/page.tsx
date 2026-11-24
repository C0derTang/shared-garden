import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LakesideLanding } from "@/components/lakeside-landing/lakeside-landing";
import { SKY_PRESETS, isSkyPreset } from "@/lib/world/sky-presets";

export const metadata: Metadata = { title: "Lakeside landing (dev)" };

/**
 * Development-only preview of the landing at a fixed sky, as a visitor or a
 * member (`?sky=dusk&member=1`). It changes no session; the member view only
 * shows the door and walk-through. Production builds 404.
 */
export default async function LandingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const sky = isSkyPreset(params.sky) && params.sky !== "live" ? params.sky : null;
  return <LakesideLanding member={params.member === "1"} time={sky ? new Date(SKY_PRESETS[sky]) : undefined} />;
}
