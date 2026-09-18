"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseAchievements, type AchievementResult } from "./model";
const unavailable =
  "Achievements could not refresh. Check your connection and try again.";
export async function readAchievements(): Promise<AchievementResult> {
  let client;
  try {
    client = (await requireMember({ unavailable: "throw" })).client;
  } catch (error) {
    if (error instanceof MemberAccessUnavailableError)
      return { state: null, error: unavailable };
    throw error;
  }
  try {
    const result = await client.rpc("current_achievements");
    if (result.error) throw result.error;
    return { state: parseAchievements(result.data), error: null };
  } catch {
    return { state: null, error: unavailable };
  }
}
