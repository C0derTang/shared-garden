"use server";

import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseAchievementsV2, parseDayAwardsV2, type AchievementStateV2, type DayAwardsV2 } from "./achievements";

const unavailable = "Achievements could not refresh. Check your connection and try again.";
const day = /^\d{4}-\d{2}-\d{2}$/;

async function actionClient() {
  try {
    return (await requireMember({ unavailable: "throw" })).client;
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError) return null;
    throw error;
  }
}

export async function readAchievementsV2(): Promise<{
  state: AchievementStateV2 | null;
  error: string | null;
}> {
  const client = await actionClient();
  if (!client) return { state: null, error: unavailable };
  try {
    const { data, error } = await client.rpc("v2_current_achievements");
    if (error) throw error;
    return { state: parseAchievementsV2(data), error: null };
  } catch {
    return { state: null, error: unavailable };
  }
}

/** Awards earned during a garden day (default: the current one). */
export async function readAwardsForDayV2(
  gardenDay: string | null = null,
): Promise<{ state: DayAwardsV2 | null; error: string | null }> {
  if (gardenDay !== null && (typeof gardenDay !== "string" || !day.test(gardenDay)))
    return { state: null, error: unavailable };
  const client = await actionClient();
  if (!client) return { state: null, error: unavailable };
  try {
    const { data, error } = await client.rpc("v2_awards_for_day", gardenDay === null ? {} : { p_day: gardenDay });
    if (error) throw error;
    return { state: parseDayAwardsV2(data), error: null };
  } catch {
    return { state: null, error: unavailable };
  }
}
