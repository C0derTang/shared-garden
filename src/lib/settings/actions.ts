"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parseSettings, parseSettingChange, type SettingsResult } from "./model";
async function access() {
  try { return await requireMember({ unavailable: "throw" }); }
  catch (error) { if (error instanceof MemberAccessUnavailableError) return null; throw error; }
}
export async function readSettings(): Promise<SettingsResult> {
  const session = await access();
  try {
    if (!session) throw Error("Unavailable");
    const response = await session.client.rpc("current_member_settings");
    if (response.error) throw response.error;
    return { state: parseSettings(response.data), error: null };
  } catch { return { state: null, error: "Your settings could not refresh. Please try again." }; }
}
export async function saveSetting(change: unknown): Promise<SettingsResult> {
  const session = await access();
  try {
    const input = parseSettingChange(change);
    if (!session) throw Error("Unavailable");
    const response = await session.client.rpc("save_member_setting", { p_change: input });
    if (response.error) throw response.error;
    return { state: parseSettings(response.data), error: null };
  } catch { return { state: null, error: "This setting was not confirmed. Refresh to check before trying again." }; }
}
