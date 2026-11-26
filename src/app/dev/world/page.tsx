import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorldShowcase } from "@/components/world/showcase/world-showcase";
import { isSkyPreset } from "@/lib/world/sky-presets";

export const metadata: Metadata = { title: "Painted world (dev)" };

/** Development-only story page for the painted world. Production builds 404. */
export default async function WorldShowcasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const preset = isSkyPreset(params.sky) ? params.sky : "day";
  const plantedParam = typeof params.planted === "string" ? Number.parseInt(params.planted, 10) : Number.NaN;
  const planted = Number.isInteger(plantedParam) && plantedParam >= 0 && plantedParam <= 120 ? plantedParam : undefined;
  return <WorldShowcase preset={preset} planted={planted} typeAreas={params.areas === "1"} walking={params.walking === "1"} />;
}
