"use server";
import { requireMember } from "@/lib/auth/server";
import { MemberAccessUnavailableError } from "@/lib/auth/access-error";
import { parsePeonyState, type PeonyCommand, type PeonyState } from "./model";
import type { SupabaseClient } from "@supabase/supabase-js";
export type PeonyResult = {
  state: PeonyState | null;
  error: string | null;
  saved?: boolean;
};
const unavailable =
  "Peony could not refresh. Your draft is here; reconnect and try again.";
async function client() {
  try {
    return (await requireMember({ unavailable: "throw" })).client;
  } catch (e) {
    if (e instanceof MemberAccessUnavailableError) return null;
    throw e;
  }
}
async function read(c: SupabaseClient, id: string): Promise<PeonyResult> {
  try {
    const r = await c.rpc("current_peony_state", { p_flower_id: id });
    if (r.error) throw r.error;
    return { state: parsePeonyState(r.data), error: null };
  } catch {
    return { state: null, error: unavailable };
  }
}
export async function readPeony(id: string): Promise<PeonyResult> {
  const c = await client();
  return c ? read(c, id) : { state: null, error: unavailable };
}
export async function mutatePeony(
  id: string,
  command: PeonyCommand,
): Promise<PeonyResult> {
  const c = await client();
  if (!c) return { state: null, error: unavailable, saved: false };
  let saved = false,
    error: string | null = null;
  try {
    let r;
    if (command?.kind === "submit")
      r = await c.rpc("submit_peony_contribution", {
        p_flower_id: id,
        p_milestone: command.milestone,
        p_payload: command.milestone === 3 ? {} : { text: command.text },
      });
    else if (command?.kind === "edit")
      r = await c.rpc("edit_peony_contribution", {
        p_contribution_id: command.id,
        p_payload: { text: command.text },
      });
    else if (command?.kind === "plan")
      r = await c.rpc("set_peony_plan", {
        p_flower_id: id,
        p_expected_version: command.version,
        p_activity: command.activity,
        p_starts_at: command.startsAt,
      });
    else if (command?.kind === "accept")
      r = await c.rpc("accept_peony_plan", {
        p_flower_id: id,
        p_plan_version: command.version,
      });
    else throw Error("Invalid action");
    if (r.error) {
      error =
        r.error.code === "42501"
          ? "Your garden access could not be verified. Sign in again."
          : "This step changed or its edit window ended. Your draft is here. Review the refreshed milestone and plan before trying again.";
    } else saved = true;
  } catch {
    error =
      "We could not confirm the save. Your draft is here. Refresh and check the milestone before trying again.";
  }
  const fresh = await read(c, id);
  return { state: fresh.state, saved, error: error ?? fresh.error };
}
