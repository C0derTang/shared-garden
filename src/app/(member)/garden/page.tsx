import { requireMember } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function GardenPage() {
  await requireMember();
  return null;
}
